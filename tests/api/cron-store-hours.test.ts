import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/cron/store-hours/route'
import { createServiceClient } from '@/lib/supabase-server'

// JST 9:00 on a Monday (weekday=1)
const FIXED_NOW = new Date('2026-05-11T00:00:00.000Z') // UTC 00:00 = JST 09:00, Monday

function makeRequest(secret?: string): Request {
  return new Request('http://localhost/api/cron/store-hours', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

type StoreRow = { id: string; is_open: boolean; manual_override_until: string | null }
type HoursRow = { store_id: string; is_open: boolean; open_time: string | null; close_time: string | null; last_order: string | null }

function mockDb(opts: {
  stores?: StoreRow[]
  hours?: HoursRow[]
  updateError?: boolean
}) {
  const stores = opts.stores ?? []
  const hours  = opts.hours  ?? []

  const storesSelectBuilder = {
    select: vi.fn().mockReturnThis(),
    data: stores,
    error: null,
  }
  // select('id, is_open, manual_override_until') → resolves
  storesSelectBuilder.select.mockResolvedValue({ data: stores, error: null })

  const hoursSelectBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  // Calling .eq() at the end resolves
  hoursSelectBuilder.eq.mockResolvedValue({ data: hours, error: null })

  const updateBuilder = {
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: null,
      error: opts.updateError ? { code: '500', message: 'fail' } : null,
    }),
  }

  let fromCall = 0
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      fromCall++
      if (table === 'stores' && fromCall === 1) return storesSelectBuilder
      if (table === 'store_hours') return hoursSelectBuilder
      // update calls (stores)
      return updateBuilder
    }),
  } as never)

  return { updateBuilder }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/store-hours', () => {
  it('returns 401 when CRON_SECRET is set and header is missing', async () => {
    vi.stubEnv('CRON_SECRET', 'secret123')
    mockDb({ stores: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
  })

  it('passes auth when CRON_SECRET matches', async () => {
    vi.stubEnv('CRON_SECRET', 'secret123')
    mockDb({ stores: [] })
    const res = await GET(makeRequest('secret123'))
    expect(res.status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('skips auth when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({ stores: [] })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    vi.unstubAllEnvs()
  })

  it('returns updated=0 when no stores exist', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({ stores: [] })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.updated).toBe(0)
    vi.unstubAllEnvs()
  })

  it('skips stores with active manual_override_until', async () => {
    vi.stubEnv('CRON_SECRET', '')
    mockDb({
      stores: [
        { id: 'store-1', is_open: true, manual_override_until: '2099-01-01T00:00:00.000Z' },
      ],
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.updated).toBe(0)
    expect(body.skipped).toBe(1)
    vi.unstubAllEnvs()
  })

  it('opens a store when current time is within business hours', async () => {
    vi.stubEnv('CRON_SECRET', '')
    // JST 09:00 on Monday — store is currently closed but should be open (08:00-20:00)
    const { updateBuilder } = mockDb({
      stores: [{ id: 'store-1', is_open: false, manual_override_until: null }],
      hours: [
        {
          store_id: 'store-1',
          is_open: true,
          open_time: '08:00',
          close_time: '20:00',
          last_order: null,
        },
      ],
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.opened).toBe(1)
    expect(body.closed).toBe(0)
    expect(updateBuilder.update).toHaveBeenCalledWith({ is_open: true })
    vi.unstubAllEnvs()
  })

  it('closes a store when current time is outside business hours', async () => {
    vi.stubEnv('CRON_SECRET', '')
    // JST 09:00 on Monday — store is currently open but closes at 09:00 (last_order)
    const { updateBuilder } = mockDb({
      stores: [{ id: 'store-1', is_open: true, manual_override_until: null }],
      hours: [
        {
          store_id: 'store-1',
          is_open: true,
          open_time: '08:00',
          close_time: '20:00',
          last_order: '09:00', // cutoff is 09:00, current is '09:00' → NOT open (< not <=)
        },
      ],
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.closed).toBe(1)
    expect(body.opened).toBe(0)
    expect(updateBuilder.update).toHaveBeenCalledWith({ is_open: false })
    vi.unstubAllEnvs()
  })

  it('does not update stores where is_open already matches', async () => {
    vi.stubEnv('CRON_SECRET', '')
    // Store is open, and should be open → no update needed
    const { updateBuilder } = mockDb({
      stores: [{ id: 'store-1', is_open: true, manual_override_until: null }],
      hours: [
        {
          store_id: 'store-1',
          is_open: true,
          open_time: '08:00',
          close_time: '20:00',
          last_order: null,
        },
      ],
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.updated).toBe(0)
    expect(updateBuilder.update).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('closes a store with no store_hours entry for the day', async () => {
    vi.stubEnv('CRON_SECRET', '')
    // Store is open but no hours defined → should close
    const { updateBuilder } = mockDb({
      stores: [{ id: 'store-1', is_open: true, manual_override_until: null }],
      hours: [], // no hours for today
    })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.closed).toBe(1)
    expect(updateBuilder.update).toHaveBeenCalledWith({ is_open: false })
    vi.unstubAllEnvs()
  })
})
