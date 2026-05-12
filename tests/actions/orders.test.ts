import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/headers と payment と supabase を mock
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: () => '127.0.0.1',
  })),
}))

const paymentMock = vi.hoisted(() => ({
  createPayment: vi.fn(),
}))

vi.mock('@/lib/payment', () => ({
  createPayment: paymentMock.createPayment,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

// rate-limit はモジュールレベルの Map を共有するためテスト間で干渉する → 常に通す
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  checkRateLimitAsync: vi.fn(async () => true),
}))

import { createOrderAction } from '@/app/actions/orders'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_A   = '22222222-2222-4222-8222-222222222222'
const ITEM_B   = '33333333-3333-4333-8333-333333333333'

interface MockOpts {
  store?: { is_open: boolean; wait_minutes?: number; stripe_account_id?: string | null } | null
  menuItems?: Array<{ id: string; name: string; price: number; is_available: boolean }> | null
  orderInsert?: { data: { id: string; order_number: number } | null; error: unknown }
  itemsInsertError?: unknown
}

function setupSupabase(opts: MockOpts) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'stores') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: opts.store ?? null, error: null }),
          }),
        }),
      }
    }
    if (table === 'menu_items') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: opts.menuItems ?? null, error: null }),
          }),
        }),
      }
    }
    if (table === 'orders') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              opts.orderInsert ?? { data: { id: 'order-uuid', order_number: 1001 }, error: null }
            ),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'order_items') {
      return {
        insert: vi.fn().mockResolvedValue({ error: opts.itemsInsertError ?? null }),
      }
    }
    throw new Error(`unexpected: ${table}`)
  })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createOrderAction', () => {
  it('rejects non-string fields', async () => {
    const fd = new FormData() // empty
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '注文データが不正です。' })
  })

  it('rejects invalid storeId UUID', async () => {
    const fd = makeFormData({ storeId: 'bad', pickupType: 'standard', items: '[]' })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '注文データが不正です。' })
  })

  it('rejects invalid pickupType', async () => {
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'evil', items: '[]' })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '注文データが不正です。' })
  })

  it('rejects empty cart', async () => {
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items: '[]' })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: 'カートが空です。' })
  })

  it('rejects items with non-integer or out-of-range qty', async () => {
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'x', price: 100, qty: 0 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '注文データが不正です。' })
  })

  it('rejects when store is closed', async () => {
    setupSupabase({ store: { is_open: false } })
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'x', price: 100, qty: 1 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '現在受付を停止しています。' })
  })

  it('rejects when store not found', async () => {
    setupSupabase({ store: null })
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'x', price: 100, qty: 1 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '店舗が見つかりません。' })
  })

  it('rejects when menu items missing', async () => {
    setupSupabase({
      store: { is_open: true },
      menuItems: [], // 何も返ってこない
    })
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'x', price: 100, qty: 1 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: 'メニューの情報を取得できませんでした。' })
  })

  it('rejects when a menu item is unavailable', async () => {
    setupSupabase({
      store: { is_open: true },
      menuItems: [{ id: ITEM_A, name: 'X', price: 100, is_available: false }],
    })
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'x', price: 100, qty: 1 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '一部のメニューが現在提供できません。' })
  })

  it('uses server-side prices (ignores client-supplied price)', async () => {
    paymentMock.createPayment.mockResolvedValue({
      clientSecret: 'cs_test',
      paymentIntentId: 'pi_test',
    })
    setupSupabase({
      store: { is_open: true, stripe_account_id: null },
      menuItems: [
        { id: ITEM_A, name: 'A', price: 500, is_available: true },
        { id: ITEM_B, name: 'B', price: 300, is_available: true },
      ],
    })
    const items = JSON.stringify([
      { menuItemId: ITEM_A, name: 'spoofed', price: 1, qty: 2 },  // クライアントは price=1 を主張
      { menuItemId: ITEM_B, name: 'spoofed', price: 1, qty: 1 },
    ])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toMatchObject({ clientSecret: 'cs_test', orderId: 'order-uuid', orderNumber: 1001 })
    // サーバー側で 500*2 + 300*1 = 1300 で計算されているか
    expect(paymentMock.createPayment).toHaveBeenCalledWith(1300, 'order-uuid', null)
  })

  it('cancels order if payment intent creation fails', async () => {
    paymentMock.createPayment.mockRejectedValue(new Error('stripe down'))
    setupSupabase({
      store: { is_open: true, stripe_account_id: null },
      menuItems: [{ id: ITEM_A, name: 'A', price: 100, is_available: true }],
    })
    const items = JSON.stringify([{ menuItemId: ITEM_A, name: 'A', price: 100, qty: 1 }])
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items })
    const r = await createOrderAction(undefined, fd)
    expect(r).toEqual({ error: '決済の準備に失敗しました。時間をおいて再試行してください。' })
  })

  it('rejects items array exceeding 30 types', async () => {
    // 31 distinct UUIDs — すべて同じ形式だが末尾インデックスを変える
    const tooManyItems = JSON.stringify(
      Array.from({ length: 31 }, (_, i) => ({
        menuItemId: `${ITEM_A.slice(0, -2)}${i.toString().padStart(2, '0')}`,
        name: `item${i}`,
        price: 100,
        qty: 1,
      }))
    )
    const fd = makeFormData({ storeId: STORE_ID, pickupType: 'standard', items: tooManyItems })
    const r = await createOrderAction(undefined, fd)
    expect(r).toMatchObject({ error: expect.stringContaining('30 種類') })
  })

  it('rejects combos array exceeding 10 types', async () => {
    // 11 distinct combo UUIDs
    const validItems = JSON.stringify([{ menuItemId: ITEM_A, name: 'A', price: 100, qty: 1 }])
    const tooManyCombos = JSON.stringify(
      Array.from({ length: 11 }, (_, i) => ({
        comboId: `${ITEM_B.slice(0, -2)}${i.toString().padStart(2, '0')}`,
        qty: 1,
      }))
    )
    const fd = makeFormData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: validItems,
      combos: tooManyCombos,
    })
    const r = await createOrderAction(undefined, fd)
    expect(r).toMatchObject({ error: expect.stringContaining('10 種類') })
  })
})
