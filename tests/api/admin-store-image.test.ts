import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted so these are available inside vi.mock() factories (which are hoisted to the top)
const { STORE_ID, USER_ID } = vi.hoisted(() => ({
  STORE_ID: '11111111-1111-4111-8111-111111111111',
  USER_ID:  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}))

vi.mock('@/lib/dal', () => ({
  verifyStoreSession: vi.fn().mockResolvedValue({
    storeId: STORE_ID,
    userId:  USER_ID,
    email:   'x@x.com',
    role:    'owner',
  }),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST, DELETE } from '@/app/api/admin/store/image/route'
import { verifyStoreSession } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(type = 'image/jpeg', size = 1000): File {
  return new File([new Uint8Array(size)], 'logo.jpg', { type })
}

function makePostReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new NextRequest('http://localhost/api/admin/store/image', {
    method: 'POST',
    body:   fd,
  })
}

function makeDeleteReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/store/image', {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

// Build a configurable supabase service client mock
function mockServiceClient(opts: {
  uploadError?: unknown
  publicUrl?: string
  updateError?: unknown
  listData?: { name: string }[]
  removeError?: unknown
} = {}) {
  const storageBucket = {
    upload:       vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    getPublicUrl: vi.fn().mockReturnValue({
      data: { publicUrl: opts.publicUrl ?? 'https://cdn.test/store/logo.jpg' },
    }),
    list:   vi.fn().mockResolvedValue({ data: opts.listData ?? [{ name: 'logo.jpg' }] }),
    remove: vi.fn().mockResolvedValue({ error: opts.removeError ?? null }),
  }

  const storesChain: Record<string, unknown> = {}
  storesChain.update = vi.fn().mockReturnValue(storesChain)
  storesChain.eq     = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })

  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'stores') return storesChain
      return storesChain
    }),
    storage: { from: vi.fn().mockReturnValue(storageBucket) },
  } as never)

  return { storageBucket, storesChain }
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
    role:    'owner',
  } as never)
  mockServiceClient()
})

// ===========================================================================
// POST
// ===========================================================================

describe('POST /api/admin/store/image — auth', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyStoreSession).mockRejectedValueOnce(new Error('Unauthorized'))
    const req = makePostReq({ file: makeFile(), type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/store/image — validation', () => {
  it('returns 400 when no file in FormData', async () => {
    const req = makePostReq({ type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type param (e.g. banner)', async () => {
    const req = makePostReq({ file: makeFile(), type: 'banner' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for disallowed MIME type (e.g. image/tiff)', async () => {
    const req = makePostReq({ file: makeFile('image/tiff'), type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when file size > 5MB', async () => {
    const bigFile = makeFile('image/jpeg', 6 * 1024 * 1024)
    const req = makePostReq({ file: bigFile, type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/store/image — success', () => {
  it('returns 200 { url: "..." } on logo upload', async () => {
    const req = makePostReq({ file: makeFile(), type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBeDefined()
    expect(typeof body.url).toBe('string')
    expect(body.url).toContain('?v=')
  })

  it('returns 200 on cover upload (different updatePayload)', async () => {
    const { storesChain } = mockServiceClient()
    const req = makePostReq({ file: makeFile('image/png', 500), type: 'cover' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    // Verify the update payload used cover_url, not logo_url
    expect(vi.mocked(storesChain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ cover_url: expect.any(String) }),
    )
  })
})

describe('POST /api/admin/store/image — errors', () => {
  it('returns 500 when storage upload fails', async () => {
    mockServiceClient({ uploadError: { message: 'storage error' } })
    const req = makePostReq({ file: makeFile(), type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB update fails', async () => {
    mockServiceClient({ updateError: { message: 'db error' } })
    const req = makePostReq({ file: makeFile(), type: 'logo' })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ===========================================================================
// DELETE
// ===========================================================================

describe('DELETE /api/admin/store/image — auth', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyStoreSession).mockRejectedValueOnce(new Error('Unauthorized'))
    const req = makeDeleteReq({ type: 'logo' })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/admin/store/image — validation', () => {
  it('returns 400 for malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/admin/store/image', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    'not-json',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type in JSON body (e.g. banner)', async () => {
    const req = makeDeleteReq({ type: 'banner' })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/store/image — success', () => {
  it('returns 200 { ok: true } on successful logo deletion', async () => {
    const req = makeDeleteReq({ type: 'logo' })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 200 on cover deletion — DB update sets cover_url: null', async () => {
    const { storesChain } = mockServiceClient()
    const req = makeDeleteReq({ type: 'cover' })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(vi.mocked(storesChain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ cover_url: null }),
    )
  })
})

describe('DELETE /api/admin/store/image — errors', () => {
  it('returns 500 when DB update fails', async () => {
    mockServiceClient({ updateError: { message: 'db error' } })
    const req = makeDeleteReq({ type: 'logo' })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })
})
