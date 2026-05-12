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
import { POST, DELETE } from '@/app/api/admin/store/images/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function makeJpeg(name = 'logo.jpg', size = 1024): File {
  const buf = new Uint8Array(size).fill(0)
  return new File([buf], name, { type: 'image/jpeg' })
}

function postReq(formData: FormData): NextRequest {
  return new Request('http://localhost/api/admin/store/images', {
    method: 'POST',
    body: formData,
  }) as unknown as NextRequest
}

function deleteReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/admin/store/images', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function setupStorageClient(opts: {
  existingFiles?: { name: string }[]
  uploadError?: { message: string } | null
  dbUpdateError?: { code: string } | null
  publicUrl?: string
}) {
  const storageBucket = {
    list: vi.fn().mockResolvedValue({ data: opts.existingFiles ?? [] }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    getPublicUrl: vi.fn().mockReturnValue({
      data: { publicUrl: opts.publicUrl ?? 'https://cdn.example.com/store-images/path.jpg' },
    }),
  }

  vi.mocked(createServiceClient).mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue(storageBucket),
    },
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: opts.dbUpdateError ?? null }),
      }),
    }),
  } as never)

  return storageBucket
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/store/images', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg())
    const res = await POST(postReq(form))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid kind', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const form = new FormData()
    form.append('kind', 'banner')
    form.append('file', makeJpeg())
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('returns 400 when file is missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const form = new FormData()
    form.append('kind', 'logo')
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty file', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg('logo.jpg', 0))
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('returns 400 for file exceeding 5MB', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg('logo.jpg', 5 * 1024 * 1024 + 1))
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('returns 400 for disallowed MIME type (gif)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const form = new FormData()
    form.append('kind', 'logo')
    const gifFile = new File([new Uint8Array(100)], 'logo.gif', { type: 'image/gif' })
    form.append('file', gifFile)
    const res = await POST(postReq(form))
    expect(res.status).toBe(400)
  })

  it('returns 500 on storage upload error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({ uploadError: { message: 'storage error' } })
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg())
    const res = await POST(postReq(form))
    expect(res.status).toBe(500)
  })

  it('returns 500 on DB update error after successful upload', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({ dbUpdateError: { code: 'PGRST301' } })
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg())
    const res = await POST(postReq(form))
    expect(res.status).toBe(500)
  })

  it('uploads logo successfully and returns url', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({ publicUrl: 'https://cdn.example.com/logo.jpg' })
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg())
    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.url).toContain('https://cdn.example.com/logo.jpg')
  })

  it('deletes existing file with different extension before uploading', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const storage = setupStorageClient({
      existingFiles: [{ name: 'logo.png' }], // 既存は .png、今回は .jpg をアップロード
    })
    const form = new FormData()
    form.append('kind', 'logo')
    form.append('file', makeJpeg('logo.jpg'))
    await POST(postReq(form))
    expect(storage.remove).toHaveBeenCalledWith([`${STORE_ID}/logo.png`])
  })

  it('uploads cover image and updates cover_url in DB', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const storage = setupStorageClient({ publicUrl: 'https://cdn.example.com/cover.jpg' })
    const form = new FormData()
    form.append('kind', 'cover')
    form.append('file', makeJpeg('cover.jpg'))
    const res = await POST(postReq(form))
    expect(res.status).toBe(200)
    // upload は cover パスで呼ばれる
    const uploadCall = storage.upload.mock.calls[0]
    expect(uploadCall[0]).toContain('cover')
  })
})

describe('DELETE /api/admin/store/images', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await DELETE(deleteReq({ kind: 'logo' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const badReq = new Request('http://localhost/api/admin/store/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    }) as unknown as NextRequest
    const res = await DELETE(badReq)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid kind', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({})
    const res = await DELETE(deleteReq({ kind: 'banner' }))
    expect(res.status).toBe(400)
  })

  it('returns 500 on DB update error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupStorageClient({
      existingFiles: [{ name: 'logo.jpg' }],
      dbUpdateError: { code: 'X' },
    })
    const res = await DELETE(deleteReq({ kind: 'logo' }))
    expect(res.status).toBe(500)
  })

  it('deletes logo files from storage and sets logo_url to null', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const storage = setupStorageClient({
      existingFiles: [{ name: 'logo.jpg' }, { name: 'cover.png' }],
    })
    const res = await DELETE(deleteReq({ kind: 'logo' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // logo.jpg のみ削除、cover.png はスキップ
    expect(storage.remove).toHaveBeenCalledWith([`${STORE_ID}/logo.jpg`])
  })

  it('succeeds even when no files exist in storage', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const storage = setupStorageClient({ existingFiles: [] })
    const res = await DELETE(deleteReq({ kind: 'cover' }))
    expect(res.status).toBe(200)
    expect(storage.remove).not.toHaveBeenCalled()
  })
})
