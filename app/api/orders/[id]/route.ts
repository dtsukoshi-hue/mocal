import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { refundPayment } from '@/lib/payment'
import { notifyOrder } from '@/lib/webpush'
import { isValidOrderStatusTransition, isValidWaitMinutes, VALID_WAIT_MINUTES } from '@/lib/validation'
import type { Order, OrderStatus, WaitMinutes } from '@/lib/database.types'

// 店舗が注文ステータスを更新するエンドポイント
// PATCH /api/orders/:id  { status: OrderStatus, waitMinutes?: WaitMinutes }
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/orders/[id]'>
) {
  const { id } = await ctx.params

  // 店舗認証
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { status: OrderStatus; waitMinutes?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { status, waitMinutes } = body

  // waitMinutes は店舗設定の許可値のみ受け付ける（仕様書 8.1）
  if (waitMinutes !== undefined && !isValidWaitMinutes(waitMinutes)) {
    return NextResponse.json(
      { error: `waitMinutes は ${VALID_WAIT_MINUTES.join('/')} のいずれかを指定してください。` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // 注文の所属店舗確認（返金に必要な stripe フィールドも取得）
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, store_id, stripe_charge_id')
    .eq('id', id)
    .single()

  if (orderErr) {
    console.error('[orders/PATCH] 注文取得失敗:', orderErr)
    return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 })
  }
  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  // 操作者が店舗メンバーか確認
  const { data: membership, error: memberErr } = await supabase
    .from('store_members')
    .select('role')
    .eq('store_id', order.store_id)
    .eq('user_id', user.id)
    .single()

  if (memberErr && memberErr.code !== 'PGRST116') {
    console.error('[orders/PATCH] 店舗メンバー確認失敗:', memberErr)
    return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 })
  }
  if (!membership) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  // ステータス遷移検証（lib/validation.ts の VALID_ORDER_TRANSITIONS に基づく）
  if (!isValidOrderStatusTransition(order.status as OrderStatus, status)) {
    return NextResponse.json(
      { error: `${order.status} → ${status} への遷移は許可されていません。` },
      { status: 422 }
    )
  }

  const now = new Date().toISOString()
  const updateData: Partial<Order> = { status }

  // 店舗スタッフによる手動キャンセルは cancelled_reason_type を明示
  if (status === 'cancelled') {
    updateData.cancelled_reason_type = 'store_cancel'
  }

  if (status === 'accepted') {
    updateData.accepted_at = now
    // waitMinutes は許可値のみ（上で検証済み）、未指定時はデフォルト 20 分
    const minutes = (waitMinutes as WaitMinutes | undefined) ?? 20
    updateData.estimated_ready_at = new Date(Date.now() + minutes * 60 * 1000).toISOString()
  }
  if (status === 'ready') updateData.ready_at = now
  if (status === 'no_show') updateData.no_show_at = now

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (updateErr) {
    console.error('[orders/PATCH] ステータス更新失敗:', updateErr)
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  // ステータス別ユーザー通知（仕様書 11.1）
  const notifyPayloads: Partial<Record<OrderStatus, { title: string; body: string }>> = {
    accepted: { title: '注文を受け付けました', body: 'もうしばらくお待ちください' },
    ready:    { title: '準備完了！', body: 'カウンターへお越しください' },
    no_show:  { title: 'お時間が経過しました', body: '受取可能時間を過ぎました' },
  }
  const notifyPayload = notifyPayloads[status]
  if (notifyPayload) {
    notifyOrder(id, { ...notifyPayload, url: `/orders/${id}` })
      .catch((e) => console.error('[orders/PATCH] 通知送信失敗:', e))
  }

  // キャンセル時の自動返金（paid 以降に決済済みの場合）
  // 仕様書 6.3: cancelled → refunded はサーバー自動
  if (status === 'cancelled' && order.stripe_charge_id) {
    const { data: storeRow, error: storeErr } = await supabase
      .from('stores')
      .select('stripe_account_id')
      .eq('id', order.store_id)
      .single()

    if (storeErr) {
      console.error('[orders/PATCH] 返金用店舗情報取得失敗:', storeErr)
    } else {
      try {
        await refundPayment(order.stripe_charge_id, storeRow?.stripe_account_id)
        const { error: refundUpdateErr } = await supabase
          .from('orders')
          .update({ status: 'refunded' })
          .eq('id', id)

        if (refundUpdateErr) {
          console.error('[orders/PATCH] refunded 更新失敗:', refundUpdateErr)
        } else {
          notifyOrder(id, {
            title: 'キャンセル・返金のお知らせ',
            body: '注文がキャンセルされ、返金処理を行いました',
            url: `/orders/${id}`,
          }).catch((e) => console.error('[orders/PATCH] 返金通知失敗:', e))
        }
      } catch (err) {
        // Stripe 返金失敗：注文は cancelled のまま、手動対応が必要
        console.error('[orders/PATCH] Stripe 返金失敗（手動対応必要）charge:', order.stripe_charge_id, err)
      }
    }
  }

  return NextResponse.json({ order: updated })
}
