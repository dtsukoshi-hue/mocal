import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const supabaseUserMock = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
}))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseUserMock),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST, DELETE } from '@/app/api/push/subscribe/route'
import { createServiceClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

const VALID_SUB = {
  endpoint: 'https://push.example.com/sub/abc',
  keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(body: unknown) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDelete(body: unknown) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function singleChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error })
  return b
}

function upsertChain(error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.upsert = vi.fn().mockResolvedValue({ error })
  return b
}

function deleteChain(error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.delete = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockResolvedValue({ error })
  return b
}

function mockClient(
  tableResponses: Record<string, () => Record<string, unknown>>,
) {
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      const factory = tableResponses[table]
      return factory ? factory() : {}
    }),
  }
  vi.mocked(createServiceClient).mockReturnValue(client as never)
  return client
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  supabaseUserMock.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// POST — input validation
// ---------------------------------------------------------------------------

describe('POST /api/push/subscribe — input validation', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when subscription keys are missing', async () => {
    const res = await POST(makePost({ subscription: { endpoint: 'https://x.com' }, orderId: ORDER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither orderId nor storeId provided', async () => {
    const res = await POST(makePost({ subscription: VALID_SUB }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when both orderId and storeId provided', async () => {
    const res = await POST(makePost({ subscription: VALID_SUB, orderId: ORDER_ID, storeId: STORE_ID }))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST — storeId path (auth + membership check)
// ---------------------------------------------------------------------------

describe('POST /api/push/subscribe — storeId path', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseUserMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePost({ subscription: VALID_SUB, storeId: STORE_ID }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not a store member', async () => {
    mockClient({
      store_members: () => singleChain(null, null),
      push_subscriptions: () => upsertChain(),
    })
    const res = await POST(makePost({ subscription: VALID_SUB, storeId: STORE_ID }))
    expect(res.status).toBe(403)
  })

  it('returns 500 when store_members query errors (not PGRST116)', async () => {
    mockClient({
      store_members: () => singleChain(null, { code: '42P01', message: 'table not found' }),
      push_subscriptions: () => upsertChain(),
    })
    const res = await POST(makePost({ subscription: VALID_SUB, storeId: STORE_ID }))
    expect(res.status).toBe(500)
  })

  it('returns 200 when user is a valid store member and upsert succeeds', async () => {
    const memberChain  = singleChain({ role: 'owner' })
    const upsertResult = upsertChain()
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'store_members')    return memberChain
        if (table === 'push_subscriptions') return upsertResult
        return {}
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makePost({ subscription: VALID_SUB, storeId: STORE_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// POST — orderId path (order existence check, no auth required)
// ---------------------------------------------------------------------------

describe('POST /api/push/subscribe — orderId path', () => {
  it('returns 400 when orderId does not exist (IDOR protection)', async () => {
    // PGRST116 = not found, no other error → orderExists is null
    const orderChain  = singleChain(null, { code: 'PGRST116', message: 'not found' })
    const client = {
      from: vi.fn().mockImplementation(() => orderChain),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makePost({ subscription: VALID_SUB, orderId: ORDER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 200 when order exists and upsert succeeds', async () => {
    const orderChain  = singleChain({ id: ORDER_ID })
    const upsertResult = upsertChain()
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders')             return orderChain
        if (table === 'push_subscriptions') return upsertResult
        return {}
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makePost({ subscription: VALID_SUB, orderId: ORDER_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 when upsert fails', async () => {
    const orderChain   = singleChain({ id: ORDER_ID })
    const upsertResult = upsertChain({ message: 'DB write error' })
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders')             return orderChain
        if (table === 'push_subscriptions') return upsertResult
        return {}
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makePost({ subscription: VALID_SUB, orderId: ORDER_ID }))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// DELETE — unsubscribe
// ---------------------------------------------------------------------------

describe('DELETE /api/push/subscribe', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new NextRequest('http://localhost/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when endpoint is missing', async () => {
    const res = await DELETE(makeDelete({}))
    expect(res.status).toBe(400)
  })

  it('returns 200 when delete succeeds', async () => {
    const client = {
      from: vi.fn().mockReturnValue(deleteChain()),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await DELETE(makeDelete({ endpoint: VALID_SUB.endpoint }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 when delete fails', async () => {
    const client = {
      from: vi.fn().mockReturnValue(deleteChain({ message: 'DB error' })),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await DELETE(makeDelete({ endpoint: VALID_SUB.endpoint }))
    expect(res.status).toBe(500)
  })
})
