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
import { PATCH, DELETE } from '@/app/api/admin/staff/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID  = '11111111-1111-4111-8111-111111111111'
const STAFF_ID  = '22222222-2222-4222-8222-222222222222'

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

function req(method: string, body: unknown = {}): NextRequest {
  return new Request(`http://localhost/api/admin/staff/${STAFF_ID}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function setupClient(opts: {
  staffStoreId?: string
  updateError?: { code: string } | null
  deleteError?: { code: string } | null
}) {
  const staffStoreId = opts.staffStoreId ?? STORE_ID
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'staff_accounts') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: STAFF_ID, store_id: staffStoreId },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: opts.deleteError ?? null }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  return fromMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/admin/staff/[id] (change password)', () => {
  it('returns 404 for invalid UUID', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
    const res = await PATCH(req('PATCH', { password: 'NewPass123!' }), makeCtx('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    setupClient({})
    const res = await PATCH(req('PATCH', { password: 'NewPass123!' }), makeCtx(STAFF_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-owner role', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'staff' })
    setupClient({})
    const res = await PATCH(req('PATCH', { password: 'NewPass123!' }), makeCtx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('returns 403 when staff belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({ staffStoreId: 'other-store' })
    const res = await PATCH(req('PATCH', { password: 'NewPass123!' }), makeCtx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('returns 400 for short password', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({})
    const res = await PATCH(req('PATCH', { password: 'short' }), makeCtx(STAFF_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is not a string', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({})
    const res = await PATCH(req('PATCH', { password: 12345678 }), makeCtx(STAFF_ID))
    expect(res.status).toBe(400)
  })

  it('changes password on valid input', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({})
    const res = await PATCH(req('PATCH', { password: 'NewSecurePass1!' }), makeCtx(STAFF_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('DELETE /api/admin/staff/[id]', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    setupClient({})
    const res = await DELETE(req('DELETE'), makeCtx(STAFF_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-owner role', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'staff' })
    setupClient({})
    const res = await DELETE(req('DELETE'), makeCtx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('returns 403 when staff belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({ staffStoreId: 'other-store' })
    const res = await DELETE(req('DELETE'), makeCtx(STAFF_ID))
    expect(res.status).toBe(403)
  })

  it('deletes staff and returns 200', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupClient({})
    const res = await DELETE(req('DELETE'), makeCtx(STAFF_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
