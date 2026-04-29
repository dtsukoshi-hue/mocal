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

// bcrypt の hash は遅いので軽量な mock
vi.mock('@/lib/staff-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff-auth')>('@/lib/staff-auth')
  return {
    ...actual,
    hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  }
})

import { GET, POST } from '@/app/api/admin/staff/route'
import { PATCH, DELETE } from '@/app/api/admin/staff/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const STAFF_ID = '22222222-2222-4222-8222-222222222222'

function req(method: string, body: unknown = {}): Request {
  return new Request('http://localhost/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ADMIN_EMAIL = 'admin@test.local'
})

describe('GET /api/admin/staff', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 for staff role', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'staff' })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('lists staff for own store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const list = [{ id: 's1', email: 'a@b.com', role: 'staff', created_at: 'x' }]
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: list, error: null }),
          }),
        }),
      }),
    } as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.staff).toEqual(list)
  })
})

describe('POST /api/admin/staff', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req('POST', { email: 'a@b.com', password: 'pw12345678' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 for staff role', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'staff' })
    const res = await POST(req('POST', { email: 'a@b.com', password: 'pw12345678' }) as never)
    expect(res.status).toBe(403)
  })

  it('rejects invalid email', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await POST(req('POST', { email: 'bad', password: 'pw12345678' }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects short password', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await POST(req('POST', { email: 'a@b.com', password: 'short' }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects role = owner', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await POST(req('POST', {
      email: 'a@b.com', password: 'pw12345678', role: 'owner',
    }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects same email as env owner', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await POST(req('POST', {
      email: 'admin@test.local',
      password: 'pw12345678',
    }) as never)
    expect(res.status).toBe(409)
  })

  it('creates staff', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const insertCall = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sid', email: 'new@b.com', role: 'staff', created_at: 'x' },
          error: null,
        }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertCall }),
    } as never)

    const res = await POST(req('POST', {
      email: 'NEW@B.com', password: 'pw12345678',
    }) as never)
    expect(res.status).toBe(201)
    expect(insertCall).toHaveBeenCalledWith(expect.objectContaining({
      store_id: STORE_ID,
      email: 'new@b.com',  // normalized
      password_hash: 'hashed:pw12345678',
      role: 'staff',
    }))
  })

  it('returns 409 on duplicate email', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } }),
          }),
        }),
      }),
    } as never)
    const res = await POST(req('POST', { email: 'a@b.com', password: 'pw12345678' }) as never)
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/admin/staff/[id]', () => {
  it('returns 404 for invalid UUID', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const res = await DELETE(req('DELETE') as never, ctx('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await DELETE(req('DELETE') as never, ctx(STAFF_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 for staff role', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'staff' })
    const res = await DELETE(req('DELETE') as never, ctx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('returns 403 when staff belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: STAFF_ID, store_id: 'other' },
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
      }),
    } as never)
    const res = await DELETE(req('DELETE') as never, ctx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('deletes staff', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: STAFF_ID, store_id: STORE_ID },
              error: null,
            }),
          }),
        }),
        delete: deleteFn,
      }),
    } as never)
    const res = await DELETE(req('DELETE') as never, ctx(STAFF_ID))
    expect(res.status).toBe(200)
    expect(deleteEq).toHaveBeenCalledWith('id', STAFF_ID)
  })
})

describe('PATCH /api/admin/staff/[id]', () => {
  it('rejects short password', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: STAFF_ID, store_id: STORE_ID },
              error: null,
            }),
          }),
        }),
      }),
    } as never)
    const res = await PATCH(req('PATCH', { password: 'short' }) as never, ctx(STAFF_ID))
    expect(res.status).toBe(400)
  })

  it('updates password hash', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: STAFF_ID, store_id: STORE_ID },
              error: null,
            }),
          }),
        }),
        update: updateFn,
      }),
    } as never)
    const res = await PATCH(req('PATCH', { password: 'newpw1234' }) as never, ctx(STAFF_ID))
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ password_hash: 'hashed:newpw1234' })
  })
})
