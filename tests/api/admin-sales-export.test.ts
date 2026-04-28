import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionMock = vi.hoisted(() => ({
  getSessionPayload: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSessionPayload: sessionMock.getSessionPayload,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { GET } from '@/app/api/admin/sales/export/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(range = '30d') {
  return new Request(`http://localhost/api/admin/sales/export?range=${range}`) as unknown as never
}

function mockOrders(orders: unknown[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: orders, error: null }),
  }
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue(builder),
  } as never)
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/sales/export', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns CSV with UTF-8 BOM and correct headers', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockOrders([
      {
        order_number: 1001,
        status: 'completed',
        total_amount: 800,
        created_at: '2026-04-28T10:00:00Z',
        accepted_at: '2026-04-28T10:01:00Z',
        ready_at: '2026-04-28T10:15:00Z',
        order_items: [{ name: 'コーヒー', qty: 2, price: 400 }],
      },
    ])

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('content-disposition')).toContain('.csv')

    // UTF-8 BOM が送信バイトに含まれていること（text() は BOM を自動除去するので bytes で確認）
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)

    const body = new TextDecoder('utf-8').decode(bytes)
    // ヘッダー
    expect(body).toContain('注文番号')
    expect(body).toContain('合計金額')
    // データ
    expect(body).toContain('1001')
    expect(body).toContain('completed')
    expect(body).toContain('800')
    expect(body).toContain('コーヒー')
  })

  it('escapes commas and quotes in item names', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockOrders([
      {
        order_number: 1002,
        status: 'completed',
        total_amount: 500,
        created_at: '2026-04-28T10:00:00Z',
        accepted_at: null,
        ready_at: null,
        order_items: [{ name: 'ラテ, 大', qty: 1, price: 500 }],
      },
    ])
    const res = await GET(req())
    const body = new TextDecoder('utf-8').decode(new Uint8Array(await res.arrayBuffer()))
    // クォート内エスケープ
    expect(body).toMatch(/"ラテ, 大 x1 \(500円\)"/)
  })

  it('handles empty result', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockOrders([])
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = new TextDecoder('utf-8').decode(new Uint8Array(await res.arrayBuffer()))
    // ヘッダー行のみ（BOM 含む）
    const lines = body.replace(/^﻿/, '').split('\r\n')
    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('注文番号')
  })

  it('returns 500 on supabase error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { code: 'X' } }),
    }
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    } as never)
    const res = await GET(req())
    expect(res.status).toBe(500)
  })

  it('uses 30d range when invalid range supplied', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = mockOrders([])
    await GET(req('xxx'))
    // gte は何かしらの ISO 文字列で呼ばれている（30日前後）
    expect(builder.gte).toHaveBeenCalledWith('created_at', expect.stringMatching(/T/))
  })
})
