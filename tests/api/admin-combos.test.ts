/**
 * /api/admin/combos の GET / POST テスト
 * recovery-plan §5.2 Phase R-2 / R2-6 (deferred → 復元)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getStoreSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/dal', () => ({
  getStoreSession: getStoreSessionMock,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { GET, POST } from '@/app/api/admin/combos/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_STORE_ID = '99999999-9999-4999-8999-999999999999'
const COMBO_ID = '22222222-2222-4222-8222-222222222222'
const MENU_A = '33333333-3333-4333-8333-333333333333'
const MENU_B = '44444444-4444-4444-8444-444444444444'

function makeRequest(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/admin/combos', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'ポテトセット',
    description: 'バーガー + ポテト',
    price_delta: -100,
    emoji: '🍟',
    is_available: true,
    sort_order: 0,
    items: [
      { menu_item_id: MENU_A, qty: 1 },
      { menu_item_id: MENU_B, qty: 2 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getStoreSessionMock.mockResolvedValue({ id: 'user-1', storeId: STORE_ID })
})

describe('GET /api/admin/combos', () => {
  it('未認証 → 401', async () => {
    getStoreSessionMock.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('正常: combos と items を返す', async () => {
    const combosChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [{ id: COMBO_ID, name: 'ポテトセット', description: null, price_delta: -100, emoji: '🍟', is_available: true, sort_order: 0 }], error: null }) }
    const itemsChain = { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ combo_id: COMBO_ID, menu_item_id: MENU_A, qty: 1 }], error: null }) }
    let n = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => (n++ === 0 ? combosChain : itemsChain)),
    } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.combos).toHaveLength(1)
    expect(body.combos[0].items).toHaveLength(1)
    expect(combosChain.eq).toHaveBeenCalledWith('store_id', STORE_ID)
  })

  it('combos 0 件: items クエリは走らず空配列返却', async () => {
    const combosChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) }
    const fromMock = vi.fn().mockReturnValue(combosChain)
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).combos).toEqual([])
    expect(fromMock).toHaveBeenCalledTimes(1) // combo_offers のみ
  })

  it('DB エラー → 500', async () => {
    const combosChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: null, error: { code: 'DB_DOWN' } }) }
    vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn().mockReturnValue(combosChain) } as never)

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/combos', () => {
  it('未認証 → 401', async () => {
    getStoreSessionMock.mockResolvedValueOnce(null)
    const res = await POST(makeRequest('POST', validBody()))
    expect(res.status).toBe(401)
  })

  it('不正な JSON → 400', async () => {
    const req = new NextRequest('http://localhost/api/admin/combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('name 欠落 → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({ name: '   ' })))
    expect(res.status).toBe(400)
  })

  it('name 長すぎ → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({ name: 'あ'.repeat(61) })))
    expect(res.status).toBe(400)
  })

  it('price_delta 範囲外 → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({ price_delta: 100_000 })))
    expect(res.status).toBe(400)
  })

  it('items 空 → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({ items: [] })))
    expect(res.status).toBe(400)
  })

  it('items 重複 menu_item_id → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({
      items: [
        { menu_item_id: MENU_A, qty: 1 },
        { menu_item_id: MENU_A, qty: 2 },
      ],
    })))
    expect(res.status).toBe(400)
  })

  it('item の menu_item_id が UUID でない → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({
      items: [{ menu_item_id: 'not-uuid', qty: 1 }],
    })))
    expect(res.status).toBe(400)
  })

  it('item の qty 不正 → 400', async () => {
    const res = await POST(makeRequest('POST', validBody({
      items: [{ menu_item_id: MENU_A, qty: 0 }],
    })))
    expect(res.status).toBe(400)
  })

  it('他店舗の menu_items を含む → 403', async () => {
    // menu_items の所有確認で MENU_B が見つからない (他店舗扱い)
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }], error: null }) }
    vi.mocked(createServiceClient).mockReturnValue({ from: vi.fn().mockReturnValue(ownItemsChain) } as never)

    const res = await POST(makeRequest('POST', validBody()))
    expect(res.status).toBe(403)
  })

  it('正常: combo + items 作成 → 201', async () => {
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }, { id: MENU_B }], error: null }) }
    const insertCombo = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: COMBO_ID, store_id: STORE_ID, name: 'ポテトセット' }, error: null }) }
    const insertItems = { insert: vi.fn().mockResolvedValue({ error: null }) }

    let n = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const order = [ownItemsChain, insertCombo, insertItems]
        return order[n++] ?? ownItemsChain
      }),
    } as never)

    const res = await POST(makeRequest('POST', validBody()))
    expect(res.status).toBe(201)
    expect(insertCombo.insert).toHaveBeenCalledWith(expect.objectContaining({ store_id: STORE_ID, name: 'ポテトセット' }))
    expect(insertItems.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ combo_id: COMBO_ID, menu_item_id: MENU_A }),
    ]))
  })

  it('combo 作成失敗 → 500', async () => {
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }, { id: MENU_B }], error: null }) }
    const insertCombo = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'DB_DOWN' } }) }

    let n = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => (n++ === 0 ? ownItemsChain : insertCombo)),
    } as never)

    const res = await POST(makeRequest('POST', validBody()))
    expect(res.status).toBe(500)
  })

  it('combo_offer_items 作成失敗 → combo cleanup + 500', async () => {
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }, { id: MENU_B }], error: null }) }
    const insertCombo = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: COMBO_ID, store_id: STORE_ID }, error: null }) }
    const insertItems = { insert: vi.fn().mockResolvedValue({ error: { code: 'DB_DOWN' } }) }
    const cleanupCombo = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }

    let n = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const order = [ownItemsChain, insertCombo, insertItems, cleanupCombo]
        return order[n++] ?? ownItemsChain
      }),
    } as never)

    const res = await POST(makeRequest('POST', validBody()))
    expect(res.status).toBe(500)
    expect(cleanupCombo.delete).toHaveBeenCalled()
    void OTHER_STORE_ID
  })
})
