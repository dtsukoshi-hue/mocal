'use server'

import { createServiceClient, createCookieClient } from '@/lib/supabase-server'
import { createPayment } from '@/lib/payment'
import { headers } from 'next/headers'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'


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
  const combosRaw = formData.get('combos')
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

  if (!Array.isArray(items)) {
    return { error: '注文データが不正です。' }
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

  // コンボのパース（任意・無くても OK）
  interface ComboInput { comboId: string; qty: number }
  let combos: ComboInput[] = []
  if (typeof combosRaw === 'string' && combosRaw.trim() !== '') {
    try {
      combos = JSON.parse(combosRaw)
    } catch {
      return { error: '注文データが不正です。' }
    }
    if (!Array.isArray(combos)) {
      return { error: '注文データが不正です。' }
    }
    for (const cc of combos) {
      if (
        typeof cc.comboId !== 'string' ||
        !uuidRegex.test(cc.comboId) ||
        typeof cc.qty !== 'number' ||
        !Number.isInteger(cc.qty) ||
        cc.qty < 1 ||
        cc.qty > 99
      ) {
        return { error: '注文データが不正です。' }
      }
    }
  }

  if (items.length === 0 && combos.length === 0) {
    return { error: 'カートが空です。' }
  }

  // Cookie に保存された Supabase セッションから匿名ユーザー ID を取得
  // 匿名ログイン済みの場合は user.id、未ログインの場合は null（後方互換）
  const cookieClient = await createCookieClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const userId = user?.id ?? null

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

  // コンボの妥当性チェック + 含まれるメニュー収集
  let comboMap: Record<string, {
    name: string
    price_delta: number
    items: { menu_item_id: string; qty: number }[]
  }> = {}

  if (combos.length > 0) {
    const comboIds = combos.map(c => c.comboId)
    const [{ data: comboRows }, { data: comboItemRows }] = await Promise.all([
      supabase
        .from('combo_offers')
        .select('id, name, price_delta, is_available')
        .in('id', comboIds)
        .eq('store_id', storeId),
      supabase
        .from('combo_offer_items')
        .select('combo_id, menu_item_id, qty')
        .in('combo_id', comboIds),
    ])

    if (!comboRows || comboRows.length !== comboIds.length) {
      return { error: 'セット情報を取得できませんでした。' }
    }
    for (const c of comboRows) {
      if (!c.is_available) {
        return { error: '一部のセットが現在提供できません。' }
      }
    }

    const itemsByCombo = new Map<string, { menu_item_id: string; qty: number }[]>()
    for (const ci of comboItemRows ?? []) {
      const arr = itemsByCombo.get(ci.combo_id) ?? []
      arr.push({ menu_item_id: ci.menu_item_id, qty: ci.qty })
      itemsByCombo.set(ci.combo_id, arr)
    }

    comboMap = Object.fromEntries(
      comboRows.map(c => [c.id, {
        name: c.name,
        price_delta: c.price_delta,
        items: itemsByCombo.get(c.id) ?? [],
      }])
    )
  }

  // メニュー在庫チェック（個別アイテム + コンボに含まれるアイテム両方）
  const allMenuIds = new Set<string>(items.map(i => i.menuItemId))
  for (const c of combos) {
    const def = comboMap[c.comboId]
    if (!def) continue
    for (const ci of def.items) allMenuIds.add(ci.menu_item_id)
  }

  const menuItemIds = Array.from(allMenuIds)
  const { data: menuItems } = menuItemIds.length === 0
    ? { data: [] as { id: string; name: string; price: number; is_available: boolean }[] }
    : await supabase
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
  const itemsTotal = items.reduce((sum, item) => {
    return sum + (priceMap[item.menuItemId] ?? 0) * item.qty
  }, 0)
  const combosTotal = combos.reduce((sum, c) => {
    const def = comboMap[c.comboId]
    if (!def) return sum
    const baseSum = def.items.reduce((s, ci) =>
      s + (priceMap[ci.menu_item_id] ?? 0) * ci.qty,
    0)
    return sum + (baseSum + def.price_delta) * c.qty
  }, 0)
  const totalAmount = itemsTotal + combosTotal

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
  type OrderItemRow = {
    order_id: string
    menu_item_id: string
    name: string
    price: number
    qty: number
    combo_id: string | null
    combo_label: string | null
  }
  const individualItems: OrderItemRow[] = items.map(item => ({
    order_id: order.id,
    menu_item_id: item.menuItemId,
    name: menuMap[item.menuItemId]?.name ?? item.name,
    price: priceMap[item.menuItemId] ?? 0,
    qty: item.qty,
    combo_id: null,
    combo_label: null,
  }))

  // コンボは含まれるメニューを展開し、combo_id / combo_label をスタンプ
  // 価格は「最初の行に price_delta を反映」する方式：
  //   - コンボの基本合計を計算
  //   - 最初のアイテムの price を (元の価格 - delta相当 / qty) で調整
  //   - 行ごとの price * qty の合計が正確なコンボ価格になるようにする
  // ただし丸め誤差を避けるため、price_delta は別行として記録するのが理想だが、
  // MVP では「最初の行に差分を集約」する単純化を採用。
  const comboItems: OrderItemRow[] = []
  for (const c of combos) {
    const def = comboMap[c.comboId]
    if (!def || def.items.length === 0) continue
    for (let copy = 0; copy < c.qty; copy++) {
      const expanded = def.items.map((ci, idx) => {
        const basePrice = priceMap[ci.menu_item_id] ?? 0
        // 最初の行に price_delta を集約（数量 1 件あたり）
        const adjusted = idx === 0
          ? basePrice + Math.floor(def.price_delta / ci.qty)
          : basePrice
        return {
          order_id: order.id,
          menu_item_id: ci.menu_item_id,
          name: menuMap[ci.menu_item_id]?.name ?? '',
          price: Math.max(0, adjusted),
          qty: ci.qty,
          combo_id: c.comboId,
          combo_label: def.name,
        }
      })
      comboItems.push(...expanded)
    }
  }

  const orderItems = [...individualItems, ...comboItems]

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
