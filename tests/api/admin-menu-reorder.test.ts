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

import { POST } from '@/app/api/admin/menu/reorder/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_A = '22222222-2222-4222-8222-222222222222'
const ITEM_B = '33333333-3333-4333-8333-333333333333'
const ITEM_C = '44444444-4444-4444-8444-444444444444'

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/menu/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

interface SetupOpts {
  ownIds: string[]
  updateError?: boolean
}

function setupSupabase(opts: SetupOpts) {
  const updateCalls: { id: string; sort_order: number }[] = []

  const fromImpl = vi.fn().mockImplementation(() => {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: opts.ownIds.map((id) => ({ id })),
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockImplementation((data: { sort_order: number }) => ({
        eq: vi.fn().mockImplementation((col: string, id: string) => {
          // 1つ目の eq('id', id) で item id を捕捉
          if (col === 'id') {
            updateCalls.push({ id, sort_order: data.sort_order })
          }
          return {
            eq: vi.fn().mockResolvedValue({
              error: opts.updateError ? { message: 'fail' } : null,
            }),
          }
        }),
      })),
    }
  })

  vi.mocked(createServiceClient).mockReturnValue({ from: fromImpl } as never)
  return { updateCalls }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/menu/reorder', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req({ items: [] }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('not json{') as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when items is missing', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 200 with updated:0 for empty array', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [] }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(0)
  })

  it('rejects too many items', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const items = Array.from({ length: 201 }, (_, i) => ({
      id: `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111`,
      sort_order: i,
    }))
    const res = await POST(req({ items }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects non-UUID id', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [{ id: 'bad', sort_order: 1 }] }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects non-integer sort_order', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({ items: [{ id: ITEM_A, sort_order: 1.5 }] }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects duplicate ids', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req({
      items: [
        { id: ITEM_A, sort_order: 10 },
        { id: ITEM_A, sort_order: 20 },
      ],
    }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when item belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ ownIds: [ITEM_A] })
    const res = await POST(req({
      items: [
        { id: ITEM_A, sort_order: 10 },
        { id: ITEM_B, sort_order: 20 },
      ],
    }) as never)
    expect(res.status).toBe(403)
  })

  it('updates each item with new sort_order', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const { updateCalls } = setupSupabase({ ownIds: [ITEM_A, ITEM_B, ITEM_C] })
    const res = await POST(req({
      items: [
        { id: ITEM_A, sort_order: 10 },
        { id: ITEM_B, sort_order: 20 },
        { id: ITEM_C, sort_order: 30 },
      ],
    }) as never)
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(3)
    expect(updateCalls).toContainEqual({ id: ITEM_A, sort_order: 10 })
    expect(updateCalls).toContainEqual({ id: ITEM_B, sort_order: 20 })
    expect(updateCalls).toContainEqual({ id: ITEM_C, sort_order: 30 })
  })

  it('returns 500 on partial update failure', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    setupSupabase({ ownIds: [ITEM_A], updateError: true })
    const res = await POST(req({
      items: [{ id: ITEM_A, sort_order: 10 }],
    }) as never)
    expect(res.status).toBe(500)
  })
})
