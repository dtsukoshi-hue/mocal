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

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/no-show', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

function mockDb(opts: {
  orders?: { id: string }[]
  updateError?: boolean
}) {
  const orders = opts.orders ?? []

  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ data: orders, error: null }),
  }

  const updateBuilder = {
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: null,
      error: opts.updateError ? { code: '500', message: 'fail' } : null,
    }),
  }

  let call = 0
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation(() => {
      call++
      return call === 1 ? selectBuilder : updateBuilder
    }),
  } as never)

  return { selectBuilder, updateBuilder }
}

beforeEach(() => {
  vi.clearAllMocks()
  pushMock.sendPushToOrder.mockResolvedValue(undefined)
})

describe('GET /api/cron/no-show', () => {
  it('returns 401 when CRON_SECRET is set and header is wrong', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    mockDb({ orders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
  })

  it('returns 200 and updated=0 when no ready orders expired', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({ orders: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(0)
    vi.unstubAllEnvs()
  })

  it('transitions expired ready orders to no_show', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const { updateBuilder } = mockDb({ orders: [{ id: ORDER_ID }] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(1)
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'no_show', no_show_at: expect.any(String) })
    )
    expect(updateBuilder.in).toHaveBeenCalledWith('id', [ORDER_ID])
    vi.unstubAllEnvs()
  })

  it('sends push notification for each transitioned order', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({ orders: [{ id: ORDER_ID }] })
    await GET(makeRequest())
    expect(pushMock.sendPushToOrder).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ title: expect.stringContaining('お受け取り') })
    )
    vi.unstubAllEnvs()
  })

  it('returns 500 when update fails', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({ orders: [{ id: ORDER_ID }], updateError: true })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    vi.unstubAllEnvs()
  })

  it('continues even if push notification fails', async () => {
    vi.stubEnv('CRON_SECRET', '')
    pushMock.sendPushToOrder.mockRejectedValue(new Error('push fail'))
    mockDb({ orders: [{ id: ORDER_ID }] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    vi.unstubAllEnvs()
  })
})
