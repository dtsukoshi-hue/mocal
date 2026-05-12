import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: () => '127.0.0.1' })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  checkRateLimitAsync: vi.fn(async () => true),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import type { NextRequest } from 'next/server'
import { POST } from '@/app/api/orders/[id]/push/route'
import { createServiceClient } from '@/lib/supabase-server'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

const VALID_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(40),
  keys: {
    p256dh: 'BNbxSo1oBbQa2T4k3Og6wNWdU6iq3OmEPh3q9dElOGw',
    auth: 'T7Tz3E1FOOBAR',
  },
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

function req(body: unknown): NextRequest {
  return new Request(`http://localhost/api/orders/${ORDER_ID}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/orders/[id]/push', () => {
  it('returns 404 for invalid UUID', async () => {
    const res = await POST(req(VALID_SUBSCRIPTION), makeCtx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid JSON body', async () => {
    const badReq = new Request(`http://localhost/api/orders/${ORDER_ID}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    }) as unknown as NextRequest
    const res = await POST(badReq, makeCtx(ORDER_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when endpoint is missing', async () => {
    const res = await POST(req({ keys: VALID_SUBSCRIPTION.keys }), makeCtx(ORDER_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when keys are missing', async () => {
    const res = await POST(req({ endpoint: VALID_SUBSCRIPTION.endpoint }), makeCtx(ORDER_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when order does not exist', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)

    const res = await POST(req(VALID_SUBSCRIPTION), makeCtx(ORDER_ID))
    expect(res.status).toBe(404)
  })

  it('registers subscription and returns 200', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: ORDER_ID }, error: null }),
              }),
            }),
          }
        }
        if (table === 'order_push_subscriptions') {
          return { upsert }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    } as never)

    const res = await POST(req(VALID_SUBSCRIPTION), makeCtx(ORDER_ID))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: ORDER_ID,
        endpoint: VALID_SUBSCRIPTION.endpoint,
        p256dh: VALID_SUBSCRIPTION.keys.p256dh,
        auth: VALID_SUBSCRIPTION.keys.auth,
      }),
      expect.any(Object)
    )
  })

  it('returns 500 on supabase upsert error', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: ORDER_ID }, error: null }),
              }),
            }),
          }
        }
        if (table === 'order_push_subscriptions') {
          return { upsert: vi.fn().mockResolvedValue({ error: { code: 'X' } }) }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    } as never)

    const res = await POST(req(VALID_SUBSCRIPTION), makeCtx(ORDER_ID))
    expect(res.status).toBe(500)
  })
})
