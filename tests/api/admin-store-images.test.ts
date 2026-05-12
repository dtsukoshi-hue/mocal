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

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

import { POST, DELETE } from '@/app/api/admin/store/images/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BUCKET = 'store-images'

function postReq(kind: string | null, file: File | null): Request {
  const fd = new FormData()
  if (kind !== null) fd.append('kind', kind)
  if (file) fd.append('file', file)
  return new Request('http://localhost/api/admin/store/images', { method: 'POST', body: fd })
}

function deleteReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/store/images', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface StorageMockOpts {
  existingFiles?: { name: string }[]
  uploadError?: { message: string } | null
  updateError?: { code: string } | null
}

function setupSupabase(opts: StorageMockOpts = {}) {
  const calls = {
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    list: vi.fn().mockResolvedValue({ data: opts.existingFiles ?? [] }),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/${BUCKET}/${path}` },
    })),
    dbUpdate: vi.fn(),
  }

  const storageBucket = {
    upload: calls.upload,
    remove: calls.remove,
    list: calls.list,
    getPublicUrl: calls.getPublicUrl,
  }

  const fromDb = vi.fn().mockImplementation((table: string) => {
    if (table === 'stores') {
      return {
        update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
          calls.dbUpdate(data)
          return { eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }) }
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  vi.mocked(createServiceClient).mockReturnValue({
    from: fromDb,
    storage: { from: vi.fn().mockReturnValue(storageBucket) },
  } as never)

  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/store/images', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(postReq('logo', null) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid kind', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase()
    const res = await POST(postReq('banner', null) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when file missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase()
    const res = await POST(postReq('logo', null) as never)
    expect(res.status).toBe(400)
  })

  it('rejects unsupported MIME type', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase()
    const file = new File(['x'], 'logo.gif', { type: 'image/gif' })
    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(400)
  })

  it('rejects files over 5 MB', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase()
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const file = new File([big], 'logo.jpg', { type: 'image/jpeg' })
    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(400)
  })

  it('uploads and saves URL when no existing file', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({ existingFiles: [] })
    const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' })

    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).not.toHaveBeenCalled()
    expect(calls.upload).toHaveBeenCalledWith(
      `${STORE_ID}/logo.jpg`,
      file,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    )
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.url).toContain(`${STORE_ID}/logo.jpg`)
  })

  it('deletes old file when extension differs before uploading new one', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    // Store has logo.jpg but user is uploading logo.png
    const calls = setupSupabase({ existingFiles: [{ name: 'logo.jpg' }] })
    const file = new File(['data'], 'logo.png', { type: 'image/png' })

    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).toHaveBeenCalledWith([`${STORE_ID}/logo.jpg`])
    expect(calls.upload).toHaveBeenCalledWith(
      `${STORE_ID}/logo.png`,
      expect.any(File),
      expect.objectContaining({ contentType: 'image/png', upsert: true }),
    )
  })

  it('does not delete file when extension is the same', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({ existingFiles: [{ name: 'cover.webp' }] })
    const file = new File(['data'], 'cover.webp', { type: 'image/webp' })

    const res = await POST(postReq('cover', file) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).not.toHaveBeenCalled()
  })

  it('does not delete other-kind file', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    // has cover.jpg — should not be touched when uploading logo
    const calls = setupSupabase({ existingFiles: [{ name: 'cover.jpg' }] })
    const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' })

    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).not.toHaveBeenCalled()
  })

  it('returns 500 when upload fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ uploadError: { message: 'network error' } })
    const file = new File(['x'], 'logo.jpg', { type: 'image/jpeg' })
    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB update fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ updateError: { code: 'XX' } })
    const file = new File(['x'], 'logo.jpg', { type: 'image/jpeg' })
    const res = await POST(postReq('logo', file) as never)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/store/images', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await DELETE(deleteReq({ kind: 'logo' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid kind', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase()
    const res = await DELETE(deleteReq({ kind: 'banner' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for malformed JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const req = new Request('http://localhost/x', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await DELETE(req as never)
    expect(res.status).toBe(400)
  })

  it('removes files from storage and nulls DB column', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({ existingFiles: [{ name: 'logo.jpg' }] })

    const res = await DELETE(deleteReq({ kind: 'logo' }) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).toHaveBeenCalledWith([`${STORE_ID}/logo.jpg`])
    expect(calls.dbUpdate).toHaveBeenCalledWith({ logo_url: null })
  })

  it('removes multiple matching files from storage', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    // Unlikely but defensive: two cover files with different extensions
    const calls = setupSupabase({ existingFiles: [{ name: 'cover.jpg' }, { name: 'cover.png' }] })

    const res = await DELETE(deleteReq({ kind: 'cover' }) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).toHaveBeenCalledWith([
      `${STORE_ID}/cover.jpg`,
      `${STORE_ID}/cover.png`,
    ])
    expect(calls.dbUpdate).toHaveBeenCalledWith({ cover_url: null })
  })

  it('skips storage remove when no file exists', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const calls = setupSupabase({ existingFiles: [] })

    const res = await DELETE(deleteReq({ kind: 'cover' }) as never)
    expect(res.status).toBe(200)
    expect(calls.remove).not.toHaveBeenCalled()
    expect(calls.dbUpdate).toHaveBeenCalledWith({ cover_url: null })
  })

  it('returns 500 when DB update fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ existingFiles: [], updateError: { code: 'XX' } })
    const res = await DELETE(deleteReq({ kind: 'logo' }) as never)
    expect(res.status).toBe(500)
  })
})
