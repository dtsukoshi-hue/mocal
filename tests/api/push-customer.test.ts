import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST as listPost, DELETE as listDelete } from '@/app/api/push/customer/route'
import { createServiceClient } from '@/lib/supabase-server'

const VALID_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc-' + 'x'.repeat(40)

function req(method: string, body: unknown): Request {
  return new Request('http://localhost/api/push/customer', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/push/customer (list)', () => {
  it('returns 400 for invalid JSON', async () => {
    const res = await listPost(req('POST', 'not json{'))
    expect(res.status).toBe(400)
  })

  it('rejects non-https endpoint', async () => {
    const res = await listPost(req('POST', { endpoint: 'http://insecure.example.com/abc' }))
    expect(res.status).toBe(400)
  })

  it('rejects too-short endpoint', async () => {
    const res = await listPost(req('POST', { endpoint: 'https://x' }))
    expect(res.status).toBe(400)
  })

  it('returns subscriptions list with order info flattened', async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'order_push_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ order_id: 'o1' }, { order_id: 'o2' }],
              error: null,
            }),
          }),
        }
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'o1', order_number: 1001, status: 'ready', stores: { name: 'Cafe X' } },
                { id: 'o2', order_number: 1002, status: 'paid',  stores: { name: 'Cafe X' } },
              ],
              error: null,
            }),
          }),
        }
      }
      throw new Error(`unexpected: ${table}`)
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)

    const res = await listPost(req('POST', { endpoint: VALID_ENDPOINT }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriptions).toEqual([
      { order_id: 'o1', order_number: 1001, status: 'ready', store_name: 'Cafe X' },
      { order_id: 'o2', order_number: 1002, status: 'paid',  store_name: 'Cafe X' },
    ])
  })

  it('returns empty list when endpoint has no subscriptions', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as never)
    const res = await listPost(req('POST', { endpoint: VALID_ENDPOINT }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriptions).toEqual([])
  })

  it('returns 500 on supabase error', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { code: 'X' } }),
        }),
      }),
    } as never)
    const res = await listPost(req('POST', { endpoint: VALID_ENDPOINT }))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/push/customer', () => {
  it('returns 400 for invalid endpoint', async () => {
    const res = await listDelete(req('DELETE', { endpoint: 'short' }))
    expect(res.status).toBe(400)
  })

  it('deletes by endpoint', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: del }),
    } as never)

    const res = await listDelete(req('DELETE', { endpoint: VALID_ENDPOINT }))
    expect(res.status).toBe(200)
    expect(eq).toHaveBeenCalledWith('endpoint', VALID_ENDPOINT)
  })
})
