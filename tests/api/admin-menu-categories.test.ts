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

import { POST } from '@/app/api/admin/menu/categories/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/menu/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

interface QueryCalls {
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
}

function mockSupabase(rows = 0): QueryCalls {
  const data = Array.from({ length: rows }, (_, i) => ({ id: `row-${i}` }))
  const select = vi.fn().mockResolvedValue({ error: null, data })
  const builder: Record<string, unknown> = {}
  builder.update = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.or = vi.fn().mockReturnValue(builder)
  builder.select = select

  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue(builder),
  } as never)
  return builder as unknown as QueryCalls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/menu/categories', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req({ from: 'A', to: 'B' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('not json{') as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when from missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ to: 'X' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when to too long', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ from: 'A', to: 'a'.repeat(31) }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 200 with updated:0 when from === to', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ from: 'Same', to: 'Same' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(0)
  })

  it('renames category for current store only', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = mockSupabase(3)
    const res = await POST(req({ from: 'Old', to: 'New' }) as never)
    expect(res.status).toBe(200)
    expect(calls.update).toHaveBeenCalledWith({ category: 'New' })
    // store_id, category の両方で絞り込んでいることを確認
    expect(calls.eq).toHaveBeenCalledWith('store_id', STORE_ID)
    expect(calls.eq).toHaveBeenCalledWith('category', 'Old')
  })

  it('handles uncategorized → named (covers null and empty)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = mockSupabase(2)
    const res = await POST(req({ from: '', to: 'Bakery' }) as never)
    expect(res.status).toBe(200)
    // 空文字 / null 両方を or 条件で拾う
    expect(calls.or).toHaveBeenCalledWith('category.is.null,category.eq.')
  })

  it('handles named → uncategorized (sets null)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = mockSupabase(1)
    const res = await POST(req({ from: 'Drinks', to: '' }) as never)
    expect(res.status).toBe(200)
    expect(calls.update).toHaveBeenCalledWith({ category: null })
  })

  it('returns 500 on supabase error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder: Record<string, unknown> = {}
    builder.update = vi.fn().mockReturnValue(builder)
    builder.eq = vi.fn().mockReturnValue(builder)
    builder.select = vi.fn().mockResolvedValue({ error: { code: 'XX' }, data: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    } as never)
    const res = await POST(req({ from: 'A', to: 'B' }) as never)
    expect(res.status).toBe(500)
  })
})
