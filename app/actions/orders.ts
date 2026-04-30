'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { createPayment } from '@/lib/payment'
import { headers } from 'next/headers'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// ゲスト注文の INSERT は RLS のゲスト用 INSERT ポリシーが無いため service_role 必須。
// ゲスト読み取りも同様に service_role を使い、UUID を access token として扱う。

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
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('order-create', ip, 10, 60_000))) {
    return { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' }
  }

  const storeId = formData.get('storeId')
  const pickupType = formData.get('pickupType')
  const itemsRaw = formData.get('items')
  const customerNoteRaw = formData.get('customerNote')
  const scheduledAtRaw = formData.get('scheduledAt')

  if (
    typeof storeId !== 'string' ||
    typeof pickupType !== 'string' ||
    typeof itemsRaw !== 'string'
  ) {
    return { error: '注文データが不正です。' }
  }

  // 備考は任意。文字列型でない場合は無視
  let customerNote: string | null = null
  if (typeof customerNoteRaw === 'string') {
    const trimmed = customerNoteRaw.trim()
    if (trimmed.length > 200) {
      return { error: '備考は 200 文字以内にしてください。' }
    }
    customerNote = trimmed === '' ? null : trimmed
  }

  // storeId UUID 形式チェック
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(storeId)) {
    return { error: '注文データが不正です。' }
  }

  // pickupType バリデーション
  if (pickupType !== 'standard' && pickupType !== 'scheduled') {
    return { error: '注文データが不正です。' }
  }

  // scheduled の場合は scheduledAt 必須・未来の時刻のみ
  let scheduledAt: string | null = null
  if (pickupType === 'scheduled') {
    if (typeof scheduledAtRaw !== 'string') {
      return { error: '受取日時を指定してください。' }
    }
    const t = new Date(scheduledAtRaw)
    if (isNaN(t.getTime())) {
      return { error: '受取日時の形式が不正です。' }
    }
    // 30 日後より遠い予約は拒否（運用ガード）
    const max = Date.now() + 30 * 24 * 60 * 60 * 1000
    if (t.getTime() < Date.now() + 15 * 60 * 1000) {
      return { error: '受取日時は15分以上先を指定してください。' }
    }
    if (t.getTime() > max) {
      return { error: '受取日時は30日以内で指定してください。' }
    }
    scheduledAt = t.toISOString()
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

  // 各アイテムの構造バリデーション
  for (const item of items) {
    if (
      typeof item.menuItemId !== 'string' ||
      !uuidRegex.test(item.menuItemId) ||
      typeof item.qty !== 'number' ||
      !Number.isInteger(item.qty) ||
      item.qty < 1 ||
      item.qty > 99
    ) {
      return { error: '注文データが不正です。' }
    }
  }

  // ゲスト注文のため user_id は常に null（Supabase Auth は使用しない）
  const userId = null

  // RLS のゲスト用 INSERT ポリシーが無い & UUID/価格はサーバ側で再検証するため service_role を使用
  const supabase = createServiceClient()

  // 1. 在庫・営業時間チェック
  const { data: store } = await supabase
    .from('stores')
    .select('is_open, wait_minutes, stripe_account_id')
    .eq('id', storeId)
    .single()

  if (!store) return { error: '店舗が見つかりません。' }
  if (!store.is_open) return { error: '現在受付を停止しています。' }

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
  const menuMap = Object.fromEntries(menuItems.map(m => [m.id, { price: m.price, name: m.name }]))
  const priceMap = Object.fromEntries(menuItems.map(m => [m.id, m.price]))
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
      total_amount: totalAmount,
      customer_note: customerNote,
      scheduled_at: scheduledAt,
    })
    .select('id, order_number')
    .single()

  if (orderError || !order) {
    return { error: '注文の作成に失敗しました。時間をおいて再試行してください。' }
  }

  // 3. 注文明細を挿入（名前・価格はサーバー側データのスナップショット）
  const orderItems = items.map(item => ({
    order_id: order.id,
    menu_item_id: item.menuItemId,
    name: menuMap[item.menuItemId]?.name ?? item.name,
    price: priceMap[item.menuItemId] ?? 0,
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
      store.stripe_account_id
    )
    clientSecret = payment.clientSecret

    // PaymentIntent ID を注文に紐付ける
    const { error: piError } = await supabase
      .from('orders')
      .update({ stripe_payment_intent_id: payment.paymentIntentId })
      .eq('id', order.id)
    if (piError) {
      logger.error('stripe_payment_intent_id update error', { orderId: order.id, error: piError.message })
    }
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
