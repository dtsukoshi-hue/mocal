'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createPayment } from '@/lib/payment'

export type OrderState =
  | { error: string }
  | { clientSecret: string; orderId: string; orderNumber: number }
  | undefined

interface OrderItemInput {
  menuItemId: string
  name: string
  price: number
  qty: number
}

export async function createOrderAction(
  _prevState: OrderState,
  formData: FormData
): Promise<OrderState> {
  const storeId = formData.get('storeId')
  const pickupType = formData.get('pickupType')
  const scheduledAtRaw = formData.get('scheduledAt')
  const customerNoteRaw = formData.get('customerNote')
  const itemsRaw = formData.get('items')

  if (
    typeof storeId !== 'string' ||
    typeof pickupType !== 'string' ||
    typeof itemsRaw !== 'string'
  ) {
    return { error: '注文データが不正です。' }
  }

  let scheduledAt: string | null = null
  if (pickupType === 'scheduled') {
    if (typeof scheduledAtRaw !== 'string') {
      return { error: '受取時刻を選択してください。' }
    }
    const scheduledDate = new Date(scheduledAtRaw)
    if (isNaN(scheduledDate.getTime())) {
      return { error: '受取時刻が不正です。' }
    }
    const now = Date.now()
    const diffMs = scheduledDate.getTime() - now
    if (diffMs < 10 * 60_000) {
      return { error: '受取時刻は10分以上先を指定してください。' }
    }
    if (diffMs > 3 * 60 * 60_000) {
      return { error: '受取時刻は3時間以内で指定してください。' }
    }
    scheduledAt = scheduledDate.toISOString()
  }

  let items: OrderItemInput[]
  try {
    items = JSON.parse(itemsRaw)
  } catch {
    return { error: '注文データが不正です。' }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'カートが空です。' }
  }

  const totalQty = items.reduce((sum, i) => sum + (i.qty ?? 0), 0)
  if (totalQty > 30) return { error: '1回の注文は最大30点までです。' }
  if (items.some(i => (i.qty ?? 0) > 10)) return { error: '1品目あたり最大10点までです。' }

  // ログインユーザーのIDを取得（ゲストは null）
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  const userId = user?.id ?? null

  // service_role で注文作成（RLS をバイパス）
  const supabase = createServiceClient()

  // 1. 在庫・営業時間チェック（1回目）
  const { data: store } = await supabase
    .from('stores')
    .select('is_open, wait_minutes, stripe_account_id')
    .eq('id', storeId)
    .single()

  if (!store) return { error: '店舗が見つかりません。' }
  if (!store.is_open) return { error: '現在受付を停止しています。' }

  // 時間指定注文: 店舗の待ち時間を下回っていないか再チェック（クライアント側の検証を補完）
  if (scheduledAt) {
    const minMs = Math.max(store.wait_minutes, 10) * 60_000
    const diffMs = new Date(scheduledAt).getTime() - Date.now()
    if (diffMs < minMs) {
      return { error: `受取時刻は${store.wait_minutes}分以上先を指定してください。` }
    }
  }

  // メニュー在庫チェック
  const menuItemIds = items.map(i => i.menuItemId)
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, price, is_available')
    .in('id', menuItemIds)
    .eq('store_id', storeId)

  if (!menuItems || menuItems.length !== menuItemIds.length) {
    return { error: 'メニューの情報を取得できませんでした。' }
  }

  for (const item of menuItems) {
    if (!item.is_available) {
      return { error: '一部のメニューが現在提供できません。' }
    }
  }

  // サーバー側の価格・名前で合計を計算（フロントの値は信用しない）
  const priceMap = Object.fromEntries(menuItems.map(m => [m.id, m.price]))
  const nameMap = Object.fromEntries(menuItems.map(m => [m.id, m.name]))
  const totalAmount = items.reduce((sum, item) => {
    return sum + (priceMap[item.menuItemId] ?? 0) * item.qty
  }, 0)

  // 2. 注文レコードを作成（pending）
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      store_id: storeId,
      user_id: userId,
      status: 'pending',
      pickup_type: pickupType as 'standard' | 'scheduled',
      scheduled_at: scheduledAt,
      customer_note: typeof customerNoteRaw === 'string' && customerNoteRaw.trim()
        ? customerNoteRaw.trim().slice(0, 200)
        : null,
      total_amount: totalAmount,
    })
    .select('id, order_number')
    .single()

  if (orderError || !order) {
    return { error: '注文の作成に失敗しました。時間をおいて再試行してください。' }
  }

  // 3. 注文明細を挿入（名前・価格はスナップショット）
  const orderItems = items.map(item => ({
    order_id: order.id,
    menu_item_id: item.menuItemId,
    name: nameMap[item.menuItemId] ?? item.name,
    price: priceMap[item.menuItemId] ?? item.price,
    qty: item.qty,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_reason_type: 'timeout' })
      .eq('id', order.id)
    return { error: '注文の作成に失敗しました。' }
  }

  // 4. Stripe PaymentIntent 作成
  let clientSecret: string
  try {
    const payment = await createPayment(
      totalAmount,
      order.id,
      store.stripe_account_id,
      user?.email ?? null
    )
    clientSecret = payment.clientSecret

    // PaymentIntent ID を注文に紐付ける
    await supabase
      .from('orders')
      .update({ stripe_payment_intent_id: payment.paymentIntentId })
      .eq('id', order.id)
  } catch {
    // PaymentIntent 作成失敗 → 注文をキャンセル
    await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_reason_type: 'payment_failed' })
      .eq('id', order.id)
    return { error: '決済の準備に失敗しました。時間をおいて再試行してください。' }
  }

  return { clientSecret, orderId: order.id, orderNumber: order.order_number }
}
