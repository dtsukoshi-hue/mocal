/**
 * /api/admin/combos/[id] の PATCH / DELETE テスト
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

import { PATCH, DELETE } from '@/app/api/admin/combos/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_STORE = '99999999-9999-4999-8999-999999999999'
const COMBO_ID = '22222222-2222-4222-8222-222222222222'
const MENU_A = '33333333-3333-4333-8333-333333333333'
const MENU_B = '44444444-4444-4444-8444-444444444444'

function makeRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeCtx(id = COMBO_ID) {
  return { params: Promise.resolve({ id }) } as never
}

/**
 * authorize() 用 mock: combo_offers .select().eq().single() を返す
 * 続けて発生するクエリは続きの handlers から取る
 */
function setupAuth(combo: { id: string; store_id: string } | null, ...rest: unknown[]) {
  const comboChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: combo, error: null }) }
  const chains = [comboChain, ...rest]
  let n = 0
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation(() => chains[n++] ?? chains[chains.length - 1]),
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  getStoreSessionMock.mockResolvedValue({ id: 'user-1', storeId: STORE_ID })
})

describe('PATCH /api/admin/combos/[id]', () => {
  it('不正な UUID → 404', async () => {
    const res = await PATCH(makeRequest({ name: 'x' }), makeCtx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('未認証 → 401', async () => {
    getStoreSessionMock.mockResolvedValueOnce(null)
    const res = await PATCH(makeRequest({ name: 'x' }), makeCtx())
    expect(res.status).toBe(401)
  })

  it('combo が存在しない → 404', async () => {
    setupAuth(null)
    const res = await PATCH(makeRequest({ name: 'x' }), makeCtx())
    expect(res.status).toBe(404)
  })

  it('他店舗の combo → 403', async () => {
    setupAuth({ id: COMBO_ID, store_id: OTHER_STORE })
    const res = await PATCH(makeRequest({ name: 'x' }), makeCtx())
    expect(res.status).toBe(403)
  })

  it('不正な JSON body → 400', async () => {
    setupAuth({ id: COMBO_ID, store_id: STORE_ID })
    const req = new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await PATCH(req, makeCtx())
    expect(res.status).toBe(400)
  })

  it('name 空 → 400', async () => {
    setupAuth({ id: COMBO_ID, store_id: STORE_ID })
    const res = await PATCH(makeRequest({ name: '   ' }), makeCtx())
    expect(res.status).toBe(400)
  })

  it('price_delta 範囲外 → 400', async () => {
    setupAuth({ id: COMBO_ID, store_id: STORE_ID })
    const res = await PATCH(makeRequest({ price_delta: 999_999 }), makeCtx())
    expect(res.status).toBe(400)
  })

  it('正常: name のみ更新 → 200', async () => {
    const updateChain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    setupAuth({ id: COMBO_ID, store_id: STORE_ID }, updateChain)

    const res = await PATCH(makeRequest({ name: 'リニューアル' }), makeCtx())
    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'リニューアル' }))
  })

  it('items 入替: 他店舗 menu_items を含む → 403', async () => {
    // authorize → update なし (items のみ) → menu_items own check で他店舗扱い
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }], error: null }) }
    setupAuth({ id: COMBO_ID, store_id: STORE_ID }, ownItemsChain)

    const res = await PATCH(makeRequest({
      items: [
        { menu_item_id: MENU_A, qty: 1 },
        { menu_item_id: MENU_B, qty: 1 },
      ],
    }), makeCtx())
    expect(res.status).toBe(403)
  })

  it('items 入替成功 → 200', async () => {
    const ownItemsChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: MENU_A }, { id: MENU_B }], error: null }) }
    const deleteChain = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    const insertChain = { insert: vi.fn().mockResolvedValue({ error: null }) }
    setupAuth({ id: COMBO_ID, store_id: STORE_ID }, ownItemsChain, deleteChain, insertChain)

    const res = await PATCH(makeRequest({
      items: [
        { menu_item_id: MENU_A, qty: 1 },
        { menu_item_id: MENU_B, qty: 2 },
      ],
    }), makeCtx())
    expect(res.status).toBe(200)
    expect(deleteChain.delete).toHaveBeenCalled()
    expect(insertChain.insert).toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/combos/[id]', () => {
  it('不正な UUID → 404', async () => {
    const req = new NextRequest(`http://localhost/api/admin/combos/not-uuid`, { method: 'DELETE' })
    const res = await DELETE(req, makeCtx('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('未認証 → 401', async () => {
    getStoreSessionMock.mockResolvedValueOnce(null)
    const req = new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, makeCtx())
    expect(res.status).toBe(401)
  })

  it('combo が存在しない → 404', async () => {
    setupAuth(null)
    const req = new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, makeCtx())
    expect(res.status).toBe(404)
  })

  it('他店舗の combo → 403', async () => {
    setupAuth({ id: COMBO_ID, store_id: OTHER_STORE })
    const req = new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, makeCtx())
    expect(res.status).toBe(403)
  })

  it('正常: 削除成功 → 200', async () => {
    const deleteChain = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    setupAuth({ id: COMBO_ID, store_id: STORE_ID }, deleteChain)

    const req = new NextRequest(`http://localhost/api/admin/combos/${COMBO_ID}`, { method: 'DELETE' })
    const res = await DELETE(req, makeCtx())
    expect(res.status).toBe(200)
    expect(deleteChain.delete).toHaveBeenCalled()
  })
})
