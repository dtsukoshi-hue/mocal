import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: () => '127.0.0.1',
  })),
}))

import { POST } from '@/app/api/orders/lookup/route'
import { createServiceClient } from '@/lib/supabase-server'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

function req(body: unknown): Request {
  return new Request('http://localhost/api/orders/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function mockSelect(data: unknown[] | null, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.in = vi.fn().mockReturnValue(builder)
  builder.order = vi.fn().mockResolvedValue({ data, error })
  vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn().mockReturnValue(builder) } as never)
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/orders/lookup', () => {
  it('returns 400 for invalid JSON', async () => {
    const res = await POST(req('not json{') as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when body has no ids', async () => {
    const res = await POST(req({}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is not an array', async () => {
    const res = await POST(req({ ids: 'not-array' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns empty list when ids array is empty', async () => {
    const res = await POST(req({ ids: [] }) as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ orders: [] })
  })

  it('returns empty list when all ids invalid (no DB call)', async () => {
    mockSelect([])
    const res = await POST(req({ ids: ['bad', null, ''] }) as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ orders: [] })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when too many ids', async () => {
    const ids = Array.from({ length: 21 }, (_, i) =>
      `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
    )
    const res = await POST(req({ ids }) as never)
    expect(res.status).toBe(400)
  })

  it('returns matching orders for valid ids', async () => {
    const sample = [
      { id: ID_A, order_number: 1001, status: 'ready', total_amount: 800, created_at: '2026-04-27T00:00:00Z', estimated_ready_at: null, stores: { name: 'Cafe X' } },
    ]
    const builder = mockSelect(sample)
    const res = await POST(req({ ids: [ID_A, ID_B] }) as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.orders).toEqual(sample)
    expect(builder.in).toHaveBeenCalledWith('id', expect.arrayContaining([ID_A, ID_B]))
  })

  it('returns 500 on supabase error', async () => {
    mockSelect(null, { message: 'db down', code: 'PGRST500' })
    const res = await POST(req({ ids: [ID_A] }) as never)
    expect(res.status).toBe(500)
  })
})
