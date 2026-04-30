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

import { POST as menuPost } from '@/app/api/admin/menu/route'
import { PATCH as menuPatch, DELETE as menuDelete } from '@/app/api/admin/menu/[id]/route'
import { PATCH as storePatch } from '@/app/api/admin/store/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function req(method: string, url: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function ctxId(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/menu', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await menuPost(req('POST', 'http://x', { name: 'A', price: 100 }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for empty name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await menuPost(req('POST', 'http://x', { name: '   ', price: 100 }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative price', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await menuPost(req('POST', 'http://x', { name: 'A', price: -1 }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-integer price', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await menuPost(req('POST', 'http://x', { name: 'A', price: 1.5 }) as never)
    expect(res.status).toBe(400)
  })

  it('inserts item when valid', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new', name: 'A', price: 100 }, error: null }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as never)

    const res = await menuPost(req('POST', 'http://x', { name: 'A', price: 100 }) as never)
    expect(res.status).toBe(201)
    // store_id がセッションから注入されているか
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: STORE_ID, name: 'A', price: 100 })
    )
  })
})

describe('PATCH /api/admin/menu/[id]', () => {
  it('returns 404 for invalid UUID', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await menuPatch(req('PATCH', 'http://x', { name: 'A' }) as never, ctxId('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await menuPatch(req('PATCH', 'http://x', { name: 'A' }) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 404 when item not found', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
    const res = await menuPatch(req('PATCH', 'http://x', { name: 'A' }) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(404)
  })

  it('returns 403 when item belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ITEM_ID, store_id: 'other-store' },
              error: null,
            }),
          }),
        }),
      }),
    } as never)
    const res = await menuPatch(req('PATCH', 'http://x', { name: 'A' }) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(403)
  })

  it('rejects empty name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ITEM_ID, store_id: STORE_ID },
              error: null,
            }),
          }),
        }),
      }),
    } as never)
    const res = await menuPatch(req('PATCH', 'http://x', { name: '   ' }) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/menu/[id]', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await menuDelete(req('DELETE', 'http://x', {}) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 when item is from another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: ITEM_ID, store_id: 'other' },
              error: null,
            }),
          }),
        }),
      }),
    } as never)
    const res = await menuDelete(req('DELETE', 'http://x', {}) as never, ctxId(ITEM_ID))
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/store', () => {
  function mockUpdateOk() {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ update }),
    } as never)
    return update
  }

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await storePatch(req('PATCH', 'http://x', { is_open: true }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-boolean is_open', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await storePatch(req('PATCH', 'http://x', { is_open: 'yes' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty body', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await storePatch(req('PATCH', 'http://x', {}) as never)
    expect(res.status).toBe(400)
  })

  it('updates is_open and sets manual override until', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const update = mockUpdateOk()
    const res = await storePatch(req('PATCH', 'http://x', { is_open: false }) as never)
    expect(res.status).toBe(200)
    // is_open 変更時は manual_override_until が同時に設定される
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_open: false,
        manual_override_until: expect.stringMatching(/T/),
      })
    )
  })

  it('clears override when clear_override is true', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const update = mockUpdateOk()
    const res = await storePatch(req('PATCH', 'http://x', { clear_override: true }) as never)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ manual_override_until: null })
  })

  it('rejects empty store name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await storePatch(req('PATCH', 'http://x', { name: '   ' }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects too-long store name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await storePatch(req('PATCH', 'http://x', { name: 'a'.repeat(61) }) as never)
    expect(res.status).toBe(400)
  })

  it('updates store name (trimmed)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const update = mockUpdateOk()
    const res = await storePatch(req('PATCH', 'http://x', { name: '  Cafe X  ' }) as never)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ name: 'Cafe X' })
  })

  it('rejects non-allowed wait_minutes', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await storePatch(req('PATCH', 'http://x', { wait_minutes: 25 }) as never)
    expect(res.status).toBe(400)
  })

  it('updates wait_minutes', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const update = mockUpdateOk()
    const res = await storePatch(req('PATCH', 'http://x', { wait_minutes: 30 }) as never)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ wait_minutes: 30 })
  })

  it('updates multiple fields at once', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const update = mockUpdateOk()
    const res = await storePatch(req('PATCH', 'http://x', {
      name: 'New', wait_minutes: 20, is_open: true,
    }) as never)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New',
        wait_minutes: 20,
        is_open: true,
        manual_override_until: expect.stringMatching(/T/),
      })
    )
  })
})
