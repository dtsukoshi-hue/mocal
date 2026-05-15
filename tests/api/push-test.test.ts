import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const supabaseMock = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseMock),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/webpush', () => ({
  notifyStore: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/push/test/route'
import { createServiceClient } from '@/lib/supabase-server'
import { notifyStore } from '@/lib/webpush'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STORE_ID = '11111111-1111-4111-8111-111111111111'

function makeMemberChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error })
  return b
}

function mockServiceClientWith(membership: unknown, membershipError: unknown = null) {
  const chain = makeMemberChain(membership, membershipError)
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
  } as never)
  return chain
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  })
})

describe('POST /api/push/test — auth', () => {
  it('returns 401 when not authenticated (user = null)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('POST /api/push/test — authorization', () => {
  it('returns 403 when user has no store membership', async () => {
    mockServiceClientWith(null)
    const res = await POST()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('POST /api/push/test — success', () => {
  it('returns 200 { ok: true } when notifyStore succeeds', async () => {
    mockServiceClientWith({ store_id: STORE_ID })
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('calls notifyStore with the correct store_id from membership', async () => {
    mockServiceClientWith({ store_id: STORE_ID })
    await POST()
    expect(vi.mocked(notifyStore)).toHaveBeenCalledWith(STORE_ID, expect.any(Object))
  })

  it('calls notifyStore with expected payload shape (title, body, url)', async () => {
    mockServiceClientWith({ store_id: STORE_ID })
    await POST()
    expect(vi.mocked(notifyStore)).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({
        title: expect.any(String),
        body:  expect.any(String),
        url:   expect.any(String),
      }),
    )
  })
})

describe('POST /api/push/test — error handling', () => {
  it('returns 500 when notifyStore throws', async () => {
    mockServiceClientWith({ store_id: STORE_ID })
    vi.mocked(notifyStore).mockRejectedValueOnce(new Error('push failed'))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})
