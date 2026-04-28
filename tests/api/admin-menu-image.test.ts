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

import { POST, DELETE } from '@/app/api/admin/menu/[id]/image/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

function fileReq(file: File | null): Request {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new Request('http://localhost/x', { method: 'POST', body: fd })
}

interface SupabaseMockOpts {
  itemRow?: { id: string; store_id: string; image_url: string | null } | null
  uploadError?: { message: string } | null
  updateError?: { code: string } | null
}

function setupSupabase(opts: SupabaseMockOpts) {
  const calls = {
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    storageRemove: vi.fn().mockResolvedValue({ error: null }),
    updateImageUrl: vi.fn(),
  }

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'menu_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: opts.itemRow ?? null,
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data: { image_url: string | null }) => {
          calls.updateImageUrl(data.image_url)
          return { eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }) }
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  const storageBucket = {
    upload: calls.upload,
    remove: calls.storageRemove,
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/menu-images/${path}` },
    })),
  }

  vi.mocked(createServiceClient).mockReturnValue({
    from: fromMock,
    storage: { from: vi.fn().mockReturnValue(storageBucket) },
  } as never)

  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/menu/[id]/image', () => {
  it('returns 404 for invalid UUID', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(fileReq(null) as never, ctx('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 404 when item not found', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: null })
    const res = await POST(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(404)
  })

  it('returns 403 when item belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: { id: ITEM_ID, store_id: 'other', image_url: null } })
    const res = await POST(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(403)
  })

  it('returns 400 when file missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: { id: ITEM_ID, store_id: STORE_ID, image_url: null } })
    const res = await POST(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('rejects unsupported MIME types', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: { id: ITEM_ID, store_id: STORE_ID, image_url: null } })
    const file = new File(['x'], 'bad.gif', { type: 'image/gif' })
    const res = await POST(fileReq(file) as never, ctx(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('rejects files over 5 MB', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: { id: ITEM_ID, store_id: STORE_ID, image_url: null } })
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const file = new File([big], 'big.jpg', { type: 'image/jpeg' })
    const res = await POST(fileReq(file) as never, ctx(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('uploads valid image and saves public URL', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({ itemRow: { id: ITEM_ID, store_id: STORE_ID, image_url: null } })
    const file = new File(['fakebytes'], 'cat.jpg', { type: 'image/jpeg' })

    const res = await POST(fileReq(file) as never, ctx(ITEM_ID))
    expect(res.status).toBe(200)
    expect(calls.upload).toHaveBeenCalled()
    expect(calls.updateImageUrl).toHaveBeenCalledWith(
      expect.stringContaining('/menu-images/')
    )
    const body = await res.json()
    expect(body.url).toContain('/menu-images/')
  })

  it('rolls back upload when DB update fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({
      itemRow: { id: ITEM_ID, store_id: STORE_ID, image_url: null },
      updateError: { code: 'XX' },
    })
    const file = new File(['x'], 'cat.jpg', { type: 'image/jpeg' })
    const res = await POST(fileReq(file) as never, ctx(ITEM_ID))
    expect(res.status).toBe(500)
    // upload した直後に削除でロールバック
    expect(calls.storageRemove).toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/menu/[id]/image', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await DELETE(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 when item belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ itemRow: { id: ITEM_ID, store_id: 'other', image_url: null } })
    const res = await DELETE(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(403)
  })

  it('clears image_url and removes from storage', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({
      itemRow: {
        id: ITEM_ID,
        store_id: STORE_ID,
        image_url: 'https://test.supabase.co/storage/v1/object/public/menu-images/store/item/123.jpg',
      },
    })
    const res = await DELETE(fileReq(null) as never, ctx(ITEM_ID))
    expect(res.status).toBe(200)
    expect(calls.storageRemove).toHaveBeenCalledWith(['store/item/123.jpg'])
    expect(calls.updateImageUrl).toHaveBeenCalledWith(null)
  })
})
