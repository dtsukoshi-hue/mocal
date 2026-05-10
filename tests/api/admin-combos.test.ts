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

import { POST as combosPost, GET as combosGet } from '@/app/api/admin/combos/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_A = '22222222-2222-4222-8222-222222222222'
const ITEM_B = '33333333-3333-4333-8333-333333333333'

function req(method: string, body: unknown = {}): Request {
  return new Request('http://localhost/api/admin/combos', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/combos', () => {
  function ownItemsClient(ownIds: string[], insertedCombo: { id: string }) {
    let firstFromCall = true
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'menu_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: ownIds.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'combo_offers') {
        if (firstFromCall) {
          firstFromCall = false
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: insertedCombo, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'combo_offer_items') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  }

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await combosPost(req('POST', { name: 'X', price_delta: 0, items: [{ menu_item_id: ITEM_A, qty: 1 }] }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', 'not json{'))
    expect(res.status).toBe(400)
  })

  it('rejects empty name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', {
      name: '   ',
      price_delta: 0,
      items: [{ menu_item_id: ITEM_A, qty: 1 }],
    }))
    expect(res.status).toBe(400)
  })

  it('rejects empty items', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', {
      name: 'X', price_delta: 0, items: [],
    }))
    expect(res.status).toBe(400)
  })

  it('rejects duplicate menu_item_id in items', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', {
      name: 'X',
      price_delta: 0,
      items: [
        { menu_item_id: ITEM_A, qty: 1 },
        { menu_item_id: ITEM_A, qty: 2 },
      ],
    }))
    expect(res.status).toBe(400)
  })

  it('rejects non-integer qty', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', {
      name: 'X', price_delta: 0,
      items: [{ menu_item_id: ITEM_A, qty: 1.5 }],
    }))
    expect(res.status).toBe(400)
  })

  it('rejects price_delta out of range', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await combosPost(req('POST', {
      name: 'X', price_delta: 99999,
      items: [{ menu_item_id: ITEM_A, qty: 1 }],
    }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when item belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    ownItemsClient([], { id: 'combo-x' })
    const res = await combosPost(req('POST', {
      name: 'X', price_delta: 0,
      items: [{ menu_item_id: ITEM_A, qty: 1 }],
    }))
    expect(res.status).toBe(403)
  })

  it('creates combo with items on valid input', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    ownItemsClient([ITEM_A, ITEM_B], { id: 'combo-x' })
    const res = await combosPost(req('POST', {
      name: 'ポテトセット',
      description: 'フライドポテト追加',
      price_delta: -100,
      emoji: '🍟',
      items: [
        { menu_item_id: ITEM_A, qty: 1 },
        { menu_item_id: ITEM_B, qty: 2 },
      ],
    }))
    expect(res.status).toBe(201)
  })
})

describe('GET /api/admin/combos', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await combosGet()
    expect(res.status).toBe(401)
  })

  it('returns combos with items grouped', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'combo_offers') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'c1', name: 'A', description: null, price_delta: 0, emoji: null, is_available: true, sort_order: 0 },
                  { id: 'c2', name: 'B', description: null, price_delta: 0, emoji: null, is_available: true, sort_order: 1 },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'combo_offer_items') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                { combo_id: 'c1', menu_item_id: ITEM_A, qty: 1 },
                { combo_id: 'c2', menu_item_id: ITEM_B, qty: 2 },
                // c-foreign は .in() で除外されているので返さない
              ],
              error: null,
            }),
          }),
        }
      }
      throw new Error(`unexpected: ${table}`)
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)

    const res = await combosGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.combos).toHaveLength(2)
    expect(body.combos[0].items).toEqual([{ menu_item_id: ITEM_A, qty: 1 }])
    expect(body.combos[1].items).toEqual([{ menu_item_id: ITEM_B, qty: 2 }])
    // 自店舗外の combo_id (c-foreign) はフィルタされる
  })
})
