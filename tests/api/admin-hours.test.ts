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
import { GET, PUT } from '@/app/api/admin/hours/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/admin/hours', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest
}

function validHours(): { weekday: number; is_open: boolean; open_time: string; close_time: string; last_order: string | null }[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    is_open: weekday >= 1 && weekday <= 5, // 月〜金のみ営業
    open_time: '10:00',
    close_time: '22:00',
    last_order: '21:30' as string | null,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/hours', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns hours for authenticated store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const rows = [{ weekday: 1, is_open: true, open_time: '10:00', close_time: '22:00', last_order: null }]
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hours).toEqual(rows)
  })

  it('returns empty array when no hours set', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hours).toEqual([])
  })
})

describe('PUT /api/admin/hours', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await PUT(req('PUT', { hours: validHours() }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const badReq = new Request('http://localhost/api/admin/hours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    }) as unknown as NextRequest
    const res = await PUT(badReq)
    expect(res.status).toBe(400)
  })

  it('returns 400 when hours is not an array', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await PUT(req('PUT', { hours: 'not-array' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when hours has wrong length (not 7)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await PUT(req('PUT', { hours: validHours().slice(0, 5) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid weekday value', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const hours = validHours()
    hours[0] = { ...hours[0], weekday: 7 } // 0-6 が有効
    const res = await PUT(req('PUT', { hours }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for duplicate weekday', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const hours = validHours()
    hours[1] = { ...hours[0], weekday: 0 } // 0 が重複
    const res = await PUT(req('PUT', { hours }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid time format', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const hours = validHours()
    hours[1] = { ...hours[1], is_open: true, open_time: '25:00', close_time: '22:00', last_order: null }
    const res = await PUT(req('PUT', { hours }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid last_order format', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const hours = validHours()
    hours[1] = { ...hours[1], is_open: true, open_time: '10:00', close_time: '22:00', last_order: 'badtime' }
    const res = await PUT(req('PUT', { hours }))
    expect(res.status).toBe(400)
  })

  it('upserts valid hours and returns 200', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never)

    const res = await PUT(req('PUT', { hours: validHours() }))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledOnce()
    // 時刻なし行（定休日）の open_time / close_time は null になる
    const rows = upsert.mock.calls[0][0] as { weekday: number; open_time: string | null }[]
    const sunday = rows.find((r) => r.weekday === 0)
    expect(sunday?.open_time).toBeNull()
  })

  it('allows null last_order for open days', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never)

    const hours = validHours().map((h) => ({ ...h, last_order: null }))
    const res = await PUT(req('PUT', { hours }))
    expect(res.status).toBe(200)
  })

  it('returns 500 on supabase upsert error', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { code: 'X' } }),
      }),
    } as never)

    const res = await PUT(req('PUT', { hours: validHours() }))
    expect(res.status).toBe(500)
  })
})
