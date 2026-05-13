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

import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/menu/import/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/menu/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'バーガー', price: 800, ...overrides }
}

function setupDb(opts: { maxSortOrder?: number | null; insertError?: { code: string } | null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null })
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.maxSortOrder != null ? { sort_order: opts.maxSortOrder } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
      insert,
    }),
  } as never)
  return insert
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/menu/import', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req({ items: [validItem()] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const badReq = new Request('http://localhost/api/admin/menu/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    }) as unknown as NextRequest
    const res = await POST(badReq)
    expect(res.status).toBe(400)
  })

  it('returns 400 when items is not an array', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: 'not-array' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when items is empty', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when items exceeds 200', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const items = Array.from({ length: 201 }, (_, i) => validItem({ name: `Item${i}` }))
    const res = await POST(req({ items }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [{ price: 100 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ name: '   ' })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for name exceeding 60 chars', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ name: 'A'.repeat(61) })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative price', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ price: -1 })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for price exceeding 999999', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ price: 1_000_000 })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-integer price', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ price: 1.5 })] }))
    expect(res.status).toBe(400)
  })

  it('accepts price as string (parses to int)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = setupDb()
    const res = await POST(req({ items: [validItem({ price: '500' })] }))
    expect(res.status).toBe(201)
    const inserted = insert.mock.calls[0][0] as { price: number }[]
    expect(inserted[0].price).toBe(500)
  })

  it('returns 400 for category exceeding 30 chars', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ category: 'C'.repeat(31) })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for description exceeding 200 chars', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ description: 'D'.repeat(201) })] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for emoji exceeding 4 chars', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [validItem({ emoji: '12345' })] }))
    expect(res.status).toBe(400)
  })

  it('inserts with correct store_id and is_available=true', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = setupDb({ maxSortOrder: 100 })
    const res = await POST(req({ items: [validItem()] }))
    expect(res.status).toBe(201)
    const rows = insert.mock.calls[0][0] as { store_id: string; is_available: boolean }[]
    expect(rows[0].store_id).toBe(STORE_ID)
    expect(rows[0].is_available).toBe(true)
  })

  it('appends after existing items using max sort_order', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = setupDb({ maxSortOrder: 50 })
    await POST(req({ items: [validItem({ name: 'A' }), validItem({ name: 'B' })] }))
    const rows = insert.mock.calls[0][0] as { sort_order: number; name: string }[]
    // baseOrder = 50 + 10 = 60; A→60, B→70
    expect(rows[0].sort_order).toBe(60)
    expect(rows[1].sort_order).toBe(70)
  })

  it('starts at sort_order 10 when no items exist yet', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = setupDb({ maxSortOrder: null })
    await POST(req({ items: [validItem()] }))
    const rows = insert.mock.calls[0][0] as { sort_order: number }[]
    expect(rows[0].sort_order).toBe(10)
  })

  it('omits optional fields when blank', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = setupDb()
    await POST(req({ items: [validItem({ category: '', description: '', emoji: '' })] }))
    const rows = insert.mock.calls[0][0] as { category: string | null; description: string | null; emoji: string | null }[]
    expect(rows[0].category).toBeNull()
    expect(rows[0].description).toBeNull()
    expect(rows[0].emoji).toBeNull()
  })

  it('returns imported count on success', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupDb()
    const items = [validItem({ name: 'A' }), validItem({ name: 'B' }), validItem({ name: 'C' })]
    const res = await POST(req({ items }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.imported).toBe(3)
  })

  it('returns 500 on supabase insert error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupDb({ insertError: { code: '23505' } })
    const res = await POST(req({ items: [validItem()] }))
    expect(res.status).toBe(500)
  })
})
