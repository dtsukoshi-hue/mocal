/**
 * createOrderAction のコンボ計算ロジックの単体テスト。
 * R2-1 (recovery-plan §5.2) で復元したコンボ受領 + 計算ロジックを verify。
 *
 * 既存の items-only パスは scope 外（recovery 復元で挙動は変えていない）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseMock = vi.hoisted(() => {
  const handlers: Record<string, () => unknown> = {}
  return {
    handlers,
    from: vi.fn((table: string) => {
      const fn = handlers[table]
      if (!fn) throw new Error(`unexpected from(${table})`)
      return fn()
    }),
  }
})

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => supabaseMock),
}))

vi.mock('@/lib/customer-session', () => ({
  ensureCustomerSession: vi.fn().mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
}))

const createPaymentMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/payment', () => ({
  createPayment: createPaymentMock,
}))

import { createOrderAction } from '@/app/actions/orders'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const COMBO_ID = '22222222-2222-4222-8222-222222222222'
const MENU_A = '33333333-3333-4333-8333-333333333333'
const MENU_B = '44444444-4444-4444-8444-444444444444'
const ORDER_ID = '55555555-5555-4555-8555-555555555555'

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(supabaseMock.handlers).forEach(k => delete supabaseMock.handlers[k])

  createPaymentMock.mockResolvedValue({
    clientSecret: 'cs_test',
    paymentIntentId: 'pi_test',
  })
})

describe('createOrderAction — combo 計算', () => {
  it('items 空 + combos のみで正しい total_amount で order を作成する', async () => {
    // MENU_A: 500 x 1, MENU_B: 300 x 2 = 1100 + price_delta (-100) = 1000 / セット
    // セット qty=2 → 2000
    const captured: { orderInsert?: Record<string, unknown>; orderItems?: unknown[] } = {}

    supabaseMock.handlers['stores'] = () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { is_open: true, wait_minutes: 15, stripe_account_id: 'acct_test' },
      }),
    })
    supabaseMock.handlers['combo_offers'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: COMBO_ID, name: 'お得セット', price_delta: -100, is_available: true }],
      }),
    })
    supabaseMock.handlers['combo_offer_items'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          { combo_id: COMBO_ID, menu_item_id: MENU_A, qty: 1 },
          { combo_id: COMBO_ID, menu_item_id: MENU_B, qty: 2 },
        ],
      }),
    })
    supabaseMock.handlers['menu_items'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: MENU_A, name: 'バーガー', price: 500, is_available: true },
          { id: MENU_B, name: 'ポテト', price: 300, is_available: true },
        ],
      }),
    })
    supabaseMock.handlers['orders'] = () => ({
      insert: vi.fn((row: Record<string, unknown>) => {
        captured.orderInsert = row
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: ORDER_ID, order_number: 1 },
            error: null,
          }),
        }
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })
    supabaseMock.handlers['order_items'] = () => ({
      insert: vi.fn((rows: unknown[]) => {
        captured.orderItems = rows
        return Promise.resolve({ error: null })
      }),
    })

    const result = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: JSON.stringify([{ comboId: COMBO_ID, qty: 2 }]),
    }))

    expect(result).toMatchObject({ clientSecret: 'cs_test', orderId: ORDER_ID })
    expect(captured.orderInsert?.total_amount).toBe(2000)
    // 2 セット × 2 menu_items = 4 行
    expect(captured.orderItems).toHaveLength(4)
    // すべての行に combo_id / combo_label が付与されている
    for (const row of (captured.orderItems ?? []) as Array<Record<string, unknown>>) {
      expect(row.combo_id).toBe(COMBO_ID)
      expect(row.combo_label).toBe('お得セット')
    }
  })

  // -----------------------------------------------------------------------
  // #54 図 B 失敗経路カバレッジ
  // 経路 6  (createPayment throw) / 経路 6' (order_items.insert 失敗) のテスト
  // docs/payment-flow.md 図 B [6] / [6'] / app/actions/orders.ts:308-345
  // -----------------------------------------------------------------------
  function setupOrderInsertSuccess(): { orderUpdates: Record<string, unknown>[] } {
    const captured = { orderUpdates: [] as Record<string, unknown>[] }
    supabaseMock.handlers['stores'] = () => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { is_open: true, wait_minutes: 15, stripe_account_id: 'acct_test' },
      }),
    })
    supabaseMock.handlers['combo_offers'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: COMBO_ID, name: 'お得セット', price_delta: 0, is_available: true }],
      }),
    })
    supabaseMock.handlers['combo_offer_items'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ combo_id: COMBO_ID, menu_item_id: MENU_A, qty: 1 }],
      }),
    })
    supabaseMock.handlers['menu_items'] = () => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: MENU_A, name: 'バーガー', price: 500, is_available: true }],
      }),
    })
    supabaseMock.handlers['orders'] = () => ({
      insert: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: ORDER_ID, order_number: 1 },
          error: null,
        }),
      })),
      update: vi.fn((row: Record<string, unknown>) => {
        captured.orderUpdates.push(row)
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      }),
    })
    return captured
  }

  it('図 B 経路 6\': order_items.insert 失敗 → orders を cancelled (reason: timeout) に update', async () => {
    const captured = setupOrderInsertSuccess()
    supabaseMock.handlers['order_items'] = () => ({
      insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
    })

    const result = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: JSON.stringify([{ comboId: COMBO_ID, qty: 1 }]),
    }))

    expect(result).toMatchObject({ error: expect.stringContaining('注文の作成に失敗') })
    // pending pre-insert は別経路、ここでは cancelled の update が呼ばれる
    expect(captured.orderUpdates).toContainEqual({
      status: 'cancelled',
      cancelled_reason_type: 'timeout',
    })
    // PaymentIntent 作成は呼ばれない (order_items 段階で中断)
    expect(createPaymentMock).not.toHaveBeenCalled()
  })

  it('図 B 経路 6: createPayment が throw → orders を cancelled (reason: payment_failed) に update', async () => {
    const captured = setupOrderInsertSuccess()
    supabaseMock.handlers['order_items'] = () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })
    createPaymentMock.mockRejectedValueOnce(new Error('Stripe API error'))

    const result = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: JSON.stringify([{ comboId: COMBO_ID, qty: 1 }]),
    }))

    expect(result).toMatchObject({ error: expect.stringContaining('決済の準備に失敗') })
    expect(captured.orderUpdates).toContainEqual({
      status: 'cancelled',
      cancelled_reason_type: 'payment_failed',
    })
    expect(createPaymentMock).toHaveBeenCalledTimes(1)
  })

  it('不正な combos (UUID 違反 / qty 超過) は reject する', async () => {
    const bad1 = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: JSON.stringify([{ comboId: 'not-a-uuid', qty: 1 }]),
    }))
    expect(bad1).toMatchObject({ error: '注文データが不正です。' })

    const bad2 = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: JSON.stringify([{ comboId: COMBO_ID, qty: 100 }]),
    }))
    expect(bad2).toMatchObject({ error: '注文データが不正です。' })

    const bad3 = await createOrderAction(undefined, formData({
      storeId: STORE_ID,
      pickupType: 'standard',
      items: '[]',
      combos: '[]',
    }))
    expect(bad3).toMatchObject({ error: 'カートが空です。' })
  })
})
