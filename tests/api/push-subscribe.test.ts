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

import { POST, DELETE } from '@/app/api/push/subscribe/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(method: string, body: unknown): Request {
  return new Request('http://localhost/api/push/subscribe', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/push/subscribe', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req('POST', { endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('POST', 'not json{') as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when subscription fields are missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('POST', {}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when keys.auth missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('POST', {
      endpoint: 'https://fcm.googleapis.com/...',
      keys: { p256dh: 'pub-key' },
    }) as never)
    expect(res.status).toBe(400)
  })

  it('upserts subscription on valid request', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never)

    const res = await POST(req('POST', {
      endpoint: 'https://fcm.googleapis.com/abc',
      keys: { p256dh: 'pub', auth: 'auth-key' },
    }) as never)

    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: STORE_ID,
        endpoint: 'https://fcm.googleapis.com/abc',
        p256dh: 'pub',
        auth: 'auth-key',
      }),
      { onConflict: 'endpoint' }
    )
  })

  it('returns 500 on supabase error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { code: 'XX', message: 'fail' } }),
      }),
    } as never)
    const res = await POST(req('POST', {
      endpoint: 'x',
      keys: { p256dh: 'a', auth: 'b' },
    }) as never)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await DELETE(req('DELETE', { endpoint: 'x' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await DELETE(req('DELETE', 'not json{') as never)
    expect(res.status).toBe(400)
  })

  it('only deletes subscriptions belonging to this store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const del = vi.fn().mockReturnValue({ eq: eq1 })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: del }),
    } as never)

    const res = await DELETE(req('DELETE', { endpoint: 'https://fcm/abc' }) as never)
    expect(res.status).toBe(200)
    // 2 つの eq が呼ばれている = endpoint と store_id でフィルタ
    expect(eq1).toHaveBeenCalledWith('endpoint', 'https://fcm/abc')
    expect(eq2).toHaveBeenCalledWith('store_id', STORE_ID)
  })
})
