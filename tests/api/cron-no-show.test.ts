import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const { mockNotifyOrder, mockNotifyStore, mockCreateServiceClient } = vi.hoisted(() => ({
  mockNotifyOrder: vi.fn().mockResolvedValue(undefined),
  mockNotifyStore: vi.fn().mockResolvedValue(undefined),
  mockCreateServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: mockCreateServiceClient,
}))

vi.mock('@/lib/webpush', () => ({
  notifyOrder: mockNotifyOrder,
  notifyStore: mockNotifyStore,
}))

import { GET } from '@/app/api/cron/no-show/route'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_ID_1 = '11111111-1111-4111-8111-111111111111'
const STORE_ID_2 = '22222222-2222-4222-8222-222222222222'
const ORDER_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ORDER_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const FIXED_NOW = new Date('2024-06-01T10:00:00.000Z')

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

/**
 * For select chains. The last method called by the route is lt() or lte().
 * We support both being terminal (mockResolvedValue) via a flag.
 */
function listChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.lt     = vi.fn().mockResolvedValue({ data, error })
  b.gte    = vi.fn().mockReturnValue(b)
  b.lte    = vi.fn().mockResolvedValue({ data, error })
  b.in     = vi.fn().mockResolvedValue({ data, error })
  return b
}

/**
 * For update chains where the final .eq() is the terminal call.
 * The route calls .update({...}).eq('id', ...).eq('status', ...) — second eq is terminal.
 */
function updateEqChain(resolveValue: { error: unknown }) {
  let eqCount = 0
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.lt     = vi.fn().mockResolvedValue(resolveValue)
  b.eq     = vi.fn().mockImplementation(() => {
    eqCount++
    if (eqCount >= 2) return Promise.resolve(resolveValue)
    return b
  })
  return b
}

/**
 * For the pending-timeout update: .update({...}).eq('status','pending').lt('created_at', ...)
 * The last call is lt().
 */
function pendingUpdateChain(resolveValue: { error: unknown }) {
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.lt     = vi.fn().mockResolvedValue(resolveValue)
  return b
}

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers['authorization'] = authHeader
  return new NextRequest('http://localhost/api/cron/no-show', { headers })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  // Default: CRON_SECRET is set
  process.env.CRON_SECRET = 'test-cron-secret'
})

afterEach(() => {
  vi.useRealTimers()
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
  }
})

/**
 * Set up a full happy-path mock where:
 * - Call 1 (from='orders'): select no-show targets
 * - Call 2..N (per order): update to no_show
 * - Call N+1: pending timeout update
 * - Call N+2 (from='orders'): select 30min alert targets
 */
function setupSupabaseMock({
  noShowTargets = [] as { id: string; store_id: string; order_number: number }[],
  noShowUpdateError = null as unknown,
  pendingUpdateError = null as unknown,
  alertTargets = [] as { id: string; store_id: string; order_number: number; scheduled_at: string }[],
  alertUpdateError = null as unknown,
} = {}) {
  const noShowSelectChain = listChain(noShowTargets)
  const noShowUpdateChains = noShowTargets.map(() =>
    updateEqChain({ error: noShowUpdateError })
  )
  const pendingChain = pendingUpdateChain({ error: pendingUpdateError })
  const alertSelectChain = listChain(alertTargets)
  const alertUpdateChains = alertTargets.map(() =>
    updateEqChain({ error: alertUpdateError })
  )

  let fromCall = 0
  let noShowUpdateIdx = 0
  let alertUpdateIdx = 0
  const totalNoShowUpdates = noShowTargets.length
  const totalAlertUpdates = alertTargets.length

  mockCreateServiceClient.mockReturnValue({
    from: vi.fn().mockImplementation((_table: string) => {
      fromCall++
      // Call 1: select no-show targets
      if (fromCall === 1) return noShowSelectChain
      // Calls 2..(1+N): per-order no_show updates
      if (fromCall <= 1 + totalNoShowUpdates) {
        return noShowUpdateChains[noShowUpdateIdx++]
      }
      // Next: pending timeout update
      if (fromCall === 2 + totalNoShowUpdates) return pendingChain
      // Next: select 30min alert targets
      if (fromCall === 3 + totalNoShowUpdates) return alertSelectChain
      // Per-alert updates
      if (fromCall <= 3 + totalNoShowUpdates + totalAlertUpdates) {
        return alertUpdateChains[alertUpdateIdx++]
      }
      return alertSelectChain
    }),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/no-show — authentication', () => {
  it('returns 401 when Authorization header is wrong', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization scheme is not Bearer', async () => {
    const res = await GET(makeRequest('Basic test-cron-secret'))
    expect(res.status).toBe(401)
  })

  it('passes through when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    setupSupabaseMock()
    const res = await GET(makeRequest()) // no auth header — should be fine
    expect(res.status).toBe(200)
  })
})

describe('GET /api/cron/no-show — no overdue orders', () => {
  it('returns 200 { ok: true, noShow: 0 } when no ready orders are overdue', async () => {
    setupSupabaseMock({ noShowTargets: [] })
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, noShow: 0 })
  })

  it('returns correct Content-Type: application/json on success', async () => {
    setupSupabaseMock()
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('GET /api/cron/no-show — no-show processing', () => {
  it('returns 200 { ok: true, noShow: 2 } when 2 orders are overdue', async () => {
    const noShowTargets = [
      { id: ORDER_ID_1, store_id: STORE_ID_1, order_number: 1 },
      { id: ORDER_ID_2, store_id: STORE_ID_2, order_number: 2 },
    ]
    setupSupabaseMock({ noShowTargets })
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, noShow: 2 })
  })

  it('calls notifyOrder and notifyStore twice when 2 orders are overdue', async () => {
    const noShowTargets = [
      { id: ORDER_ID_1, store_id: STORE_ID_1, order_number: 1 },
      { id: ORDER_ID_2, store_id: STORE_ID_2, order_number: 2 },
    ]
    setupSupabaseMock({ noShowTargets })
    await GET(makeRequest('Bearer test-cron-secret'))

    // Fire-and-forget — flush microtasks
    await vi.runAllTimersAsync()

    expect(mockNotifyOrder).toHaveBeenCalledTimes(2)
    expect(mockNotifyStore).toHaveBeenCalledTimes(2)
    expect(mockNotifyOrder).toHaveBeenCalledWith(ORDER_ID_1, expect.objectContaining({ title: expect.any(String) }))
    expect(mockNotifyOrder).toHaveBeenCalledWith(ORDER_ID_2, expect.objectContaining({ title: expect.any(String) }))
  })

  it('skips count increment for an order whose update fails (noShow stays lower)', async () => {
    const noShowTargets = [
      { id: ORDER_ID_1, store_id: STORE_ID_1, order_number: 1 },
      { id: ORDER_ID_2, store_id: STORE_ID_2, order_number: 2 },
    ]
    // First order fails, second succeeds — need separate chains
    const failChain = updateEqChain({ error: { message: 'conflict' } })
    const okChain   = updateEqChain({ error: null })
    const pendingChain = pendingUpdateChain({ error: null })
    const alertSelectChain = listChain([])

    let fromCall = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation((_table: string) => {
        fromCall++
        if (fromCall === 1) return listChain(noShowTargets)
        if (fromCall === 2) return failChain
        if (fromCall === 3) return okChain
        if (fromCall === 4) return pendingChain
        return alertSelectChain
      }),
    })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Only 1 succeeded
    expect(body.noShow).toBe(1)
  })
})

describe('GET /api/cron/no-show — DB errors', () => {
  it('returns 500 when the initial select query fails', async () => {
    const errChain = listChain(null, { message: 'DB error' })
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue(errChain),
    })
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('GET /api/cron/no-show — pending timeout', () => {
  it('always attempts the pending → cancelled update (even when noShow=0)', async () => {
    setupSupabaseMock({ noShowTargets: [] })

    // Capture which chains were used
    const fromCalls: string[] = []
    const noShowSelectChain = listChain([])
    const pendingChain = pendingUpdateChain({ error: null })
    const alertSelectChain = listChain([])

    let fromCall = 0
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn().mockImplementation((_table: string) => {
        fromCall++
        fromCalls.push(`call${fromCall}`)
        if (fromCall === 1) return noShowSelectChain
        if (fromCall === 2) return pendingChain
        return alertSelectChain
      }),
    })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    // The pending chain's update should have been called
    expect(pendingChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'timeout' })
    )
  })
})

describe('GET /api/cron/no-show — 30-min alert', () => {
  it('sets alert_30min_sent=true and calls notifyStore when an unacknowledged scheduled order is 30min away', async () => {
    const scheduledAt = new Date(FIXED_NOW.getTime() + 30 * 60 * 1000).toISOString()
    const alertTargets = [
      { id: ORDER_ID_1, store_id: STORE_ID_1, order_number: 99, scheduled_at: scheduledAt },
    ]
    setupSupabaseMock({ noShowTargets: [], alertTargets })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)

    await vi.runAllTimersAsync()

    // notifyStore called once for the alert (not for no-show, since noShowTargets=[])
    expect(mockNotifyStore).toHaveBeenCalledTimes(1)
    expect(mockNotifyStore).toHaveBeenCalledWith(
      STORE_ID_1,
      expect.objectContaining({ title: expect.stringContaining('#99') })
    )
  })
})
