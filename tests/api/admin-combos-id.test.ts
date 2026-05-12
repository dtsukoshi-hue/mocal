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
import { PATCH, DELETE } from '@/app/api/admin/combos/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const COMBO_ID = '22222222-2222-4222-8222-222222222222'
const ITEM_A   = '33333333-3333-4333-8333-333333333333'

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

function req(method: string, body: unknown = {}): NextRequest {
  return new Request(`http://localhost/api/admin/combos/${COMBO_ID}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

/** 認証・オーナーシップが通る状態の Supabase モックを組み立てる */
function setupAuthClient(opts: {
  comboStoreId?: string
  updateError?: { code: string } | null
  deleteError?: { code: string } | null
  itemsOwnIds?: string[]
}) {
  const comboStoreId = opts.comboStoreId ?? STORE_ID

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'combo_offers') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: COMBO_ID, store_id: comboStoreId },
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
    if (table === 'menu_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: (opts.itemsOwnIds ?? [ITEM_A]).map((id) => ({ id })),
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'combo_offer_items') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
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

describe('PATCH /api/admin/combos/[id]', () => {
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
    const res = await PATCH(req('PATCH', { is_available: false }), makeCtx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
    const res = await PATCH(req('PATCH', { is_available: false }), makeCtx(COMBO_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 when combo belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({ comboStoreId: 'other-store' })
    const res = await PATCH(req('PATCH', { is_available: false }), makeCtx(COMBO_ID))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid JSON body', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const badReq = new Request(`http://localhost/api/admin/combos/${COMBO_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    }) as unknown as NextRequest
    const res = await PATCH(badReq, makeCtx(COMBO_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty name', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await PATCH(req('PATCH', { name: '   ' }), makeCtx(COMBO_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for price_delta out of range', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await PATCH(req('PATCH', { price_delta: 99999 }), makeCtx(COMBO_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-boolean is_available', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await PATCH(req('PATCH', { is_available: 'yes' }), makeCtx(COMBO_ID))
    expect(res.status).toBe(400)
  })

  it('updates is_available on valid input', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await PATCH(req('PATCH', { is_available: false }), makeCtx(COMBO_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 403 when items include another store\'s menu', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({ itemsOwnIds: [] }) // 自店舗外
    const res = await PATCH(
      req('PATCH', { items: [{ menu_item_id: ITEM_A, qty: 1 }] }),
      makeCtx(COMBO_ID)
    )
    expect(res.status).toBe(403)
  })

  it('replaces items on valid input', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({ itemsOwnIds: [ITEM_A] })
    const res = await PATCH(
      req('PATCH', { items: [{ menu_item_id: ITEM_A, qty: 2 }] }),
      makeCtx(COMBO_ID)
    )
    expect(res.status).toBe(200)
  })

  it('returns 400 for empty items array', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await PATCH(req('PATCH', { items: [] }), makeCtx(COMBO_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for duplicate menu_item_id in items', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({ itemsOwnIds: [ITEM_A] })
    const res = await PATCH(
      req('PATCH', { items: [{ menu_item_id: ITEM_A, qty: 1 }, { menu_item_id: ITEM_A, qty: 2 }] }),
      makeCtx(COMBO_ID)
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/combos/[id]', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as never)
    const res = await DELETE(req('DELETE'), makeCtx(COMBO_ID))
    expect(res.status).toBe(401)
  })

  it('returns 403 when combo belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({ comboStoreId: 'other-store' })
    const res = await DELETE(req('DELETE'), makeCtx(COMBO_ID))
    expect(res.status).toBe(403)
  })

  it('deletes combo and returns 200', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID, role: 'owner' })
    setupAuthClient({})
    const res = await DELETE(req('DELETE'), makeCtx(COMBO_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
