import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.hoisted(() => ({ sendPushToOrder: vi.fn() }))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/push', () => ({
  sendPushToOrder: pushMock.sendPushToOrder,
}))

import { GET } from '@/app/api/cron/no-show/route'
import { createServiceClient } from '@/lib/supabase-server'

const ORDER_ID  = '11111111-1111-4111-8111-111111111111'
const ORDER_ID2 = '22222222-2222-4222-8222-222222222222'

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/no-show', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

/** Supabase builder mock that supports arbitrary chain depth and resolves on await */
function makeSelectChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const thenable = {
    ...chain,
    then: (resolve: (v: typeof resolvedValue) => unknown) =>
      Promise.resolve(resolvedValue).then(resolve),
    catch: (reject: (e: unknown) => unknown) =>
      Promise.resolve(resolvedValue).catch(reject),
  }
  // All methods return the thenable so chaining + await works
  const handler = new Proxy(thenable, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch') return target[prop as 'then' | 'catch']
      return () => handler
    },
  })
  return handler
}

function makeUpdateChain(error: { code: string; message: string } | null = null) {
  const updateFn = vi.fn().mockReturnThis()
  const inFn = vi.fn().mockResolvedValue({ error })
  return { update: updateFn, in: inFn, _updateFn: updateFn }
}

function mockDbSimple(opts: {
  readyOrders?: { id: string }[]
  pendingPushOrders?: { id: string }[]
  updateError?: boolean
}) {
  const readyOrders       = opts.readyOrders ?? []
  const pendingPushOrders = opts.pendingPushOrders ?? []

  const updateErr = opts.updateError ? { code: '500', message: 'fail' } : null
  const update1 = makeUpdateChain(updateErr) // for ready → no_show
  const update2 = makeUpdateChain(null)       // for no_show_push_sent = true

  const readyChain  = makeSelectChain({ data: readyOrders,       error: null })
  const pendingChain = makeSelectChain({ data: pendingPushOrders, error: null })

  let idx = 0
  const sequence: unknown[] = [
    readyChain,
    ...(readyOrders.length > 0 ? [update1] : []),
    pendingChain,
    ...(pendingPushOrders.length > 0 ? [update2] : []),
  ]

  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation(() => sequence[idx++] ?? update2),
  } as never)

  return { update1, update2 }
}

beforeEach(() => {
  vi.clearAllMocks()
  pushMock.sendPushToOrder.mockResolvedValue(undefined)
})

describe('GET /api/cron/no-show', () => {
  it('returns 401 when CRON_SECRET is set and header is wrong', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    mockDbSimple({ readyOrders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
  })

  it('returns 200 and transitioned=0 when no ready orders expired', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDbSimple({ readyOrders: [], pendingPushOrders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transitioned).toBe(0)
    vi.unstubAllEnvs()
  })

  it('transitions expired ready orders to no_show with push_sent=true', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const { update1 } = mockDbSimple({ readyOrders: [{ id: ORDER_ID }], pendingPushOrders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transitioned).toBe(1)
    expect(update1.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'no_show', no_show_push_sent: true })
    )
    vi.unstubAllEnvs()
  })

  it('sends push notification for transitioned orders', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDbSimple({ readyOrders: [{ id: ORDER_ID }], pendingPushOrders: [] })
    await GET(makeRequest())
    expect(pushMock.sendPushToOrder).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ title: expect.stringContaining('お受け取り') })
    )
    vi.unstubAllEnvs()
  })

  it('catches up push notifications for pg_cron transitioned orders', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDbSimple({ readyOrders: [], pendingPushOrders: [{ id: ORDER_ID2 }] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.catchUp).toBe(1)
    expect(pushMock.sendPushToOrder).toHaveBeenCalledWith(ORDER_ID2, expect.any(Object))
    vi.unstubAllEnvs()
  })

  it('continues even if push notification fails', async () => {
    vi.stubEnv('CRON_SECRET', '')
    pushMock.sendPushToOrder.mockRejectedValue(new Error('push fail'))
    mockDbSimple({ readyOrders: [{ id: ORDER_ID }], pendingPushOrders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('returns 500 when transition update fails', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDbSimple({ readyOrders: [{ id: ORDER_ID }], updateError: true })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    vi.unstubAllEnvs()
  })
})
