import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted so these are available inside vi.mock() factories (which are hoisted to the top)
const { STORE_ID, USER_ID, ITEM_ID } = vi.hoisted(() => ({
  STORE_ID: '11111111-1111-4111-8111-111111111111',
  USER_ID:  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ITEM_ID:  '33333333-3333-4333-8333-333333333333',
}))

vi.mock('@/lib/dal', () => ({
  verifyStoreSession: vi.fn().mockResolvedValue({
    storeId: STORE_ID,
    userId:  USER_ID,
    email:   'x@x.com',
    role:    'staff',
  }),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/admin/menu/image/route'
import { verifyStoreSession } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(type = 'image/jpeg', size = 1000): File {
  return new File([new Uint8Array(size)], 'test.jpg', { type })
}

function makeUploadReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new NextRequest('http://localhost/api/admin/menu/image', {
    method: 'POST',
    body:   fd,
  })
}

// Build a fresh supabase service client mock with configurable chains
function mockServiceClient(opts: {
  menuItemData?: unknown
  menuItemError?: unknown
  uploadError?: unknown
  publicUrl?: string
  updateError?: unknown
} = {}) {
  const menuItemChain: Record<string, unknown> = {}
  menuItemChain.select = vi.fn().mockReturnValue(menuItemChain)
  menuItemChain.eq     = vi.fn().mockReturnValue(menuItemChain)
  menuItemChain.single = vi.fn().mockResolvedValue({
    data:  opts.menuItemData  !== undefined ? opts.menuItemData  : { id: ITEM_ID },
    error: opts.menuItemError !== undefined ? opts.menuItemError : null,
  })

  const storageChain = {
    upload:       vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    getPublicUrl: vi.fn().mockReturnValue({
      data: { publicUrl: opts.publicUrl ?? 'https://cdn.test/path' },
    }),
  }

  const updateChain: Record<string, unknown> = {}
  updateChain.update = vi.fn().mockReturnValue(updateChain)
  updateChain.eq     = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })

  let fromCall = 0
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      fromCall++
      if (table === 'menu_items' && fromCall === 1) return menuItemChain
      if (table === 'menu_items' && fromCall >= 2)  return updateChain
      return menuItemChain
    }),
    storage: { from: vi.fn().mockReturnValue(storageChain) },
  } as never)

  return { menuItemChain, storageChain, updateChain }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyStoreSession).mockResolvedValue({
    storeId: STORE_ID,
    userId:  USER_ID,
    email:   'x@x.com',
    role:    'staff',
  } as never)
  mockServiceClient()
})

describe('POST /api/admin/menu/image — auth', () => {
  it('returns 401 when verifyStoreSession throws', async () => {
    vi.mocked(verifyStoreSession).mockRejectedValueOnce(new Error('Unauthorized'))
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/menu/image — validation', () => {
  it('returns 400 when no file in FormData', async () => {
    const req = makeUploadReq({ menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when menuItemId is missing', async () => {
    const req = makeUploadReq({ file: makeFile() })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for unsupported file type (image/gif)', async () => {
    const req = makeUploadReq({ file: makeFile('image/gif'), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when file size exceeds 5MB', async () => {
    const bigFile = makeFile('image/jpeg', 6 * 1024 * 1024)
    const req = makeUploadReq({ file: bigFile, menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/menu/image — ownership', () => {
  it('returns 404 when menu item does not belong to the store', async () => {
    mockServiceClient({ menuItemData: null })
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/admin/menu/image — upload errors', () => {
  it('returns 500 when Supabase storage upload fails', async () => {
    mockServiceClient({ uploadError: { message: 'storage error' } })
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB update of image_url fails', async () => {
    mockServiceClient({ updateError: { message: 'db error' } })
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/menu/image — success', () => {
  it('returns 200 { url: "..." } on successful upload', async () => {
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBeDefined()
    expect(typeof body.url).toBe('string')
  })

  it('returned URL contains cache buster ?v=', async () => {
    const req = makeUploadReq({ file: makeFile(), menuItemId: ITEM_ID })
    const res = await POST(req)
    const body = await res.json()
    expect(body.url).toContain('?v=')
  })
})
