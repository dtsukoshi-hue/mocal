import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const { mockCreateServiceClient } = vi.hoisted(() => ({
  mockCreateServiceClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: mockCreateServiceClient,
}))

import { GET } from '@/app/api/cron/store-hours/route'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STORE_ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const STORE_ID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// Tuesday 10:00 JST = Tuesday 01:00 UTC (JST = UTC+9)
// day_of_week = 2 (Tuesday), currentTimeStr = "10:00"
const FIXED_NOW = new Date('2024-06-04T01:00:00.000Z') // Tuesday 10:00 JST

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers['authorization'] = authHeader
  return new NextRequest('http://localhost/api/cron/store-hours', { headers })
}

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

/** For select chains ending in .eq() or .in() */
function selectChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockResolvedValue({ data, error })
  b.in     = vi.fn().mockResolvedValue({ data, error })
  return b
}

/** For update chains ending in .in() */
function updateInChain(error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.in     = vi.fn().mockResolvedValue({ error })
  return b
}

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setupSupabaseMock({
  storeHours = [] as { store_id: string; open_time: string; close_time: string; is_closed: boolean }[],
  storeHoursError = null as unknown,
  stores = [] as { id: string; is_open: boolean; manual_override_until: string | null }[],
  openUpdateError = null as unknown,
  closeUpdateError = null as unknown,
} = {}) {
  const storeHoursChain = selectChain(storeHours, storeHoursError)
  const storesChain = selectChain(stores)
  const openChain = updateInChain(openUpdateError)
  const closeChain = updateInChain(closeUpdateError)

  // Route based on the update payload: { is_open: true } → openChain, { is_open: false } → closeChain
  // For the select call we use a separate chain.
  let storesSelectDone = false

  mockCreateServiceClient.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'store_hours') return storeHoursChain
      if (table === 'stores') {
        if (!storesSelectDone) {
          // First stores call is always the select for overrides
          storesSelectDone = true
          return storesChain
        }
        // Subsequent calls are update calls — intercept update() to route correctly
        const routingChain: Record<string, unknown> = {}
        routingChain.update = vi.fn().mockImplementation((payload: { is_open: boolean }) => {
          const target = payload.is_open ? openChain : closeChain
          // Proxy update call to the real chain so `toHaveBeenCalledWith` works
          ;(target.update as ReturnType<typeof vi.fn>)(payload)
          return target
        })
        return routingChain
      }
      return storeHoursChain
    }),
  })

  return { storeHoursChain, storesChain, openChain, closeChain }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/store-hours — authentication', () => {
  it('returns 401 with wrong CRON_SECRET', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/store-hours — no store hours', () => {
  it('returns { ok: true, opened: 0, closed: 0 } when no store_hours rows', async () => {
    setupSupabaseMock({ storeHours: [] })
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.opened).toBe(0)
    expect(body.closed).toBe(0)
  })
})

describe('GET /api/cron/store-hours — DB errors', () => {
  it('returns 500 when store_hours fetch fails', async () => {
    setupSupabaseMock({ storeHoursError: { message: 'DB error' } })
    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('GET /api/cron/store-hours — open/close logic', () => {
  // FIXED_NOW is Tuesday 10:00 JST

  it('opens stores within opening hours that are currently closed', async () => {
    // Store A: open 09:00-18:00 on Tuesday, currently closed (is_open: false)
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: false },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: false, manual_override_until: null },
    ]
    const { openChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opened).toBe(1)
    expect(body.closed).toBe(0)
    expect(openChain.update).toHaveBeenCalledWith({ is_open: true })
  })

  it('closes stores outside opening hours that are currently open', async () => {
    // Store B: closed on Tuesday (is_closed: true), but currently open (is_open: true)
    const storeHours = [
      { store_id: STORE_ID_B, open_time: '09:00', close_time: '18:00', is_closed: true },
    ]
    const stores = [
      { id: STORE_ID_B, is_open: true, manual_override_until: null },
    ]
    const { closeChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opened).toBe(0)
    expect(body.closed).toBe(1)
    expect(closeChain.update).toHaveBeenCalledWith({ is_open: false })
  })

  it('closes stores outside their operating hours', async () => {
    // Store A: open 12:00-18:00 on Tuesday, current time is 10:00 → should close
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '12:00', close_time: '18:00', is_closed: false },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: true, manual_override_until: null },
    ]
    const { closeChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.closed).toBe(1)
    expect(closeChain.update).toHaveBeenCalledWith({ is_open: false })
  })

  it('skips stores with manual_override_until in the future', async () => {
    const futureOverride = new Date(FIXED_NOW.getTime() + 60 * 60 * 1000).toISOString() // 1h from now
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: false },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: false, manual_override_until: futureOverride },
    ]
    setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Should be skipped — no update needed
    expect(body.opened).toBe(0)
    expect(body.closed).toBe(0)
  })

  it('does not update stores already in the correct state', async () => {
    // Store already open and within opening hours — needOpen filter removes it
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: false },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: true, manual_override_until: null },
    ]
    const { openChain, closeChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opened).toBe(0)
    // No update calls made for this store
    expect(openChain.update).not.toHaveBeenCalled()
    expect(closeChain.update).not.toHaveBeenCalled()
  })

  it('treats stores with is_closed: true as should-close regardless of time', async () => {
    // is_closed=true with times that would otherwise be open — should always close
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: true },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: true, manual_override_until: null },
    ]
    const { closeChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.closed).toBe(1)
    expect(closeChain.update).toHaveBeenCalledWith({ is_open: false })
  })

  it('handles both open and close updates in the same request', async () => {
    // Store A: should open (within hours, currently closed)
    // Store B: should close (outside hours / is_closed=true, currently open)
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: false },
      { store_id: STORE_ID_B, open_time: '09:00', close_time: '18:00', is_closed: true },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: false, manual_override_until: null },
      { id: STORE_ID_B, is_open: true, manual_override_until: null },
    ]
    const { openChain, closeChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opened).toBe(1)
    expect(body.closed).toBe(1)
    expect(openChain.update).toHaveBeenCalledWith({ is_open: true })
    expect(closeChain.update).toHaveBeenCalledWith({ is_open: false })
  })

  it('respects manual_override_until in the past (does not skip)', async () => {
    const pastOverride = new Date(FIXED_NOW.getTime() - 60 * 60 * 1000).toISOString() // 1h ago
    const storeHours = [
      { store_id: STORE_ID_A, open_time: '09:00', close_time: '18:00', is_closed: false },
    ]
    const stores = [
      { id: STORE_ID_A, is_open: false, manual_override_until: pastOverride },
    ]
    const { openChain } = setupSupabaseMock({ storeHours, stores })

    const res = await GET(makeRequest('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Past override does not block — store should be opened
    expect(body.opened).toBe(1)
    expect(openChain.update).toHaveBeenCalledWith({ is_open: true })
  })
})
