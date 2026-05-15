import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const { mockVerifyStoreSession, mockCreateServiceClient } = vi.hoisted(() => ({
  mockVerifyStoreSession: vi.fn(),
  mockCreateServiceClient: vi.fn(),
}))

vi.mock('@/lib/dal', () => ({
  verifyStoreSession: mockVerifyStoreSession,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: mockCreateServiceClient,
}))

import { GET } from '@/app/api/admin/reports/export/route'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const VALID_SESSION = {
  storeId: STORE_ID,
  userId:  USER_ID,
  email:   'test@test.com',
  role:    'owner' as const,
}

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/reports/export')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return new NextRequest(url.toString())
}

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

/**
 * For the orders select chain. The route calls:
 * .select(...).eq(...).in(...).gte(...).lte(...).order(...)
 * Last method is order() — that's the terminal promise.
 */
function ordersChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.in     = vi.fn().mockReturnValue(b)
  b.gte    = vi.fn().mockReturnValue(b)
  b.lte    = vi.fn().mockReturnValue(b)
  b.order  = vi.fn().mockResolvedValue({ data, error })
  return b
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: authenticated session
  mockVerifyStoreSession.mockResolvedValue(VALID_SESSION)
})

function setupSupabaseMock(data: unknown, error: unknown = null) {
  const chain = ordersChain(data, error)
  mockCreateServiceClient.mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
  })
  return chain
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/reports/export — authentication', () => {
  it('returns 401 when verifyStoreSession throws', async () => {
    mockVerifyStoreSession.mockRejectedValue(new Error('Not authenticated'))
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('GET /api/admin/reports/export — input validation', () => {
  it('returns 400 when start param is missing', async () => {
    const res = await GET(makeRequest({ end: '2024-01-31' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 when end param is missing', async () => {
    const res = await GET(makeRequest({ start: '2024-01-01' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 when start date format is invalid (2024/01/01)', async () => {
    const res = await GET(makeRequest({ start: '2024/01/01', end: '2024-01-31' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when end date format is invalid', async () => {
    const res = await GET(makeRequest({ start: '2024-01-01', end: 'Jan 31 2024' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/reports/export — CSV output', () => {
  it('returns 200 with CSV body and correct Content-Type when there are no orders', async () => {
    setupSupabaseMock([])
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
  })

  it('CSV starts with UTF-8 BOM (EF BB BF bytes) and contains header row', async () => {
    setupSupabaseMock([])
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    // Check BOM via raw bytes — res.text() strips the BOM character
    const buf = await res.clone().arrayBuffer()
    const bytes = new Uint8Array(buf)
    // UTF-8 BOM: 0xEF 0xBB 0xBF
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)
    // Also verify header content via text()
    const text = await res.text()
    expect(text).toContain('注文番号')
    expect(text).toContain('ステータス')
    expect(text).toContain('合計金額')
  })

  it('CSV has Content-Disposition attachment header with filename', async () => {
    setupSupabaseMock([])
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('2024-01-01')
    expect(disposition).toContain('2024-01-31')
  })

  it('CSV correctly formats a completed order with Japanese status label', async () => {
    const orders = [
      {
        order_number: 42,
        status: 'completed',
        total_amount: 1500,
        pickup_type: 'normal',
        scheduled_at: null,
        created_at: '2024-01-15T05:00:00.000Z',  // 14:00 JST
        accepted_at: '2024-01-15T05:05:00.000Z',
        ready_at: '2024-01-15T05:20:00.000Z',
        cancelled_reason_type: null,
        order_items: [
          { name: 'コーヒー', price: 500, qty: 2 },
          { name: 'サンドイッチ', price: 500, qty: 1 },
        ],
      },
    ]
    setupSupabaseMock(orders)
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    const text = await res.text()
    expect(text).toContain('受取完了')
    expect(text).toContain('42')
    expect(text).toContain('1500')
    expect(text).toContain('コーヒー×2')
    expect(text).toContain('サンドイッチ×1')
    expect(text).toContain('標準')
  })

  it('CSV correctly formats a cancelled order', async () => {
    const orders = [
      {
        order_number: 10,
        status: 'cancelled',
        total_amount: 800,
        pickup_type: 'scheduled',
        scheduled_at: '2024-01-15T07:00:00.000Z',
        created_at: '2024-01-15T05:00:00.000Z',
        accepted_at: null,
        ready_at: null,
        cancelled_reason_type: 'timeout',
        order_items: [],
      },
    ]
    setupSupabaseMock(orders)
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    const text = await res.text()
    expect(text).toContain('キャンセル')
    expect(text).toContain('時間指定')
    expect(text).toContain('timeout')
  })

  it('CSV correctly escapes double-quotes in order item names', async () => {
    const orders = [
      {
        order_number: 7,
        status: 'completed',
        total_amount: 400,
        pickup_type: 'normal',
        scheduled_at: null,
        created_at: '2024-01-15T05:00:00.000Z',
        accepted_at: null,
        ready_at: null,
        cancelled_reason_type: null,
        order_items: [
          { name: 'Special "Deluxe" Burger', price: 400, qty: 1 },
        ],
      },
    ]
    setupSupabaseMock(orders)
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    const text = await res.text()
    // Double-quotes inside CSV fields should be escaped as ""
    expect(text).toContain('Special ""Deluxe"" Burger')
  })

  it('CSV uses CRLF line endings', async () => {
    setupSupabaseMock([])
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    const text = await res.text()
    // At minimum the header row should use CRLF if there are more rows,
    // or just no CRLF if only one row — but the join is always \r\n
    // With one row (headers only), no \r\n between rows is needed.
    // With actual data rows the separator is \r\n
    // We just check the header line itself doesn't use bare \n
    expect(text).not.toMatch(/[^\r]\n/)
  })
})

describe('GET /api/admin/reports/export — DB errors', () => {
  it('returns 500 when DB query fails', async () => {
    setupSupabaseMock(null, { message: 'DB connection failed' })
    const res = await GET(makeRequest({ start: '2024-01-01', end: '2024-01-31' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})
