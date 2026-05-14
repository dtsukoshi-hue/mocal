import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionMock = vi.hoisted(() => ({ getSessionPayload: vi.fn() }))

vi.mock('@/lib/session', () => ({
  getSessionPayload: sessionMock.getSessionPayload,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { PATCH } from '@/app/api/admin/store/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/store', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockSupabase(error: { code: string; message: string } | null = null) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error }),
  }
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue(builder),
  } as never)
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/store', () => {
  it('returns 401 when not authenticated', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ name: 'test' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const req = new Request('http://localhost/api/admin/store', {
      method: 'PATCH',
      body: 'not json{',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is empty string', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await PATCH(makeRequest({ name: '   ' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when name exceeds 60 chars', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await PATCH(makeRequest({ name: 'a'.repeat(61) }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid wait_minutes', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await PATCH(makeRequest({ wait_minutes: 25 }) as never)
    expect(res.status).toBe(400)
  })

  it('updates store name successfully', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = mockSupabase()
    const res = await PATCH(makeRequest({ name: '新しい店名' }) as never)
    expect(res.status).toBe(200)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ name: '新しい店名' }))
    expect(builder.eq).toHaveBeenCalledWith('id', STORE_ID)
  })

  it('sets manual_override_until when is_open is updated', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = mockSupabase()
    const res = await PATCH(makeRequest({ is_open: true }) as never)
    expect(res.status).toBe(200)
    const updateArg = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg.is_open).toBe(true)
    expect(updateArg.manual_override_until).toBeDefined()
    expect(typeof updateArg.manual_override_until).toBe('string')
  })

  it('clears manual_override_until when clear_override is true', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = mockSupabase()
    const res = await PATCH(makeRequest({ clear_override: true }) as never)
    expect(res.status).toBe(200)
    const updateArg = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateArg.manual_override_until).toBeNull()
  })

  it('updates wait_minutes with valid value', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const builder = mockSupabase()
    const res = await PATCH(makeRequest({ wait_minutes: 30 }) as never)
    expect(res.status).toBe(200)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ wait_minutes: 30 }))
  })

  it('returns 500 on DB error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockSupabase({ code: '500', message: 'fail' })
    const res = await PATCH(makeRequest({ name: 'test store' }) as never)
    expect(res.status).toBe(500)
  })
})
