import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { refundPayment } from '@/lib/payment'
import { logger } from '@/lib/logger'
import { sendPushToOrder } from '@/lib/push'
import {
  ALL_ORDER_STATUSES,
  isValidOrderStatusTransition,
  isUuid,
} from '@/lib/validation'
import type { CancelledReasonType, OrderStatus } from '@/lib/database.types'

// 仕様書 11. 通知トリガー
const PUSH_PAYLOADS: Record<string, { title: string; body: string }> = {
  accepted:  { title: '注文を受け付けました', body: '調理を開始しました。' },
  ready:     { title: '🎉 ご注文の準備ができました', body: 'カウンターまでお越しください。' },
  no_show:   { title: 'お受け取りお時間が経過しました', body: '店舗にご相談ください。' },
  refunded:  { title: '返金処理が完了しました', body: 'ご利用ありがとうございました。' },
  cancelled: { title: '注文がキャンセルされました', body: '詳しくは店舗にお問い合わせください。' },
}

// 店舗が注文ステータスを更新するエンドポイント
// PATCH /api/orders/:id  { status: OrderStatus }
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/orders/[id]'>
) {
  const { id } = await ctx.params

  // カスタムセッションで店舗認証（Supabase Auth は使用しない）
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  // UUID 形式チェック（不正なパスパラメータによるクエリを防ぐ）
  if (!isUuid(id)) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  let body: { status: OrderStatus; waitMinutes?: number; cancelledReasonType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { status, waitMinutes, cancelledReasonType } = body

  // status の入力バリデーション
  if (!ALL_ORDER_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'ステータス値が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 注文の所属店舗確認
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, store_id, stripe_charge_id')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  // セッションの storeId と注文の store_id を照合（権限確認）
  if (session.storeId !== order.store_id) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  // ステータス遷移検証（仕様書 6.4 に基づく）
  if (!isValidOrderStatusTransition(order.status as OrderStatus, status)) {
    return NextResponse.json(
      { error: 'このステータスへの変更は現在許可されていません。' },
      { status: 422 }
    )
  }

  const STORE_CANCEL_REASONS: CancelledReasonType[] = ['out_of_stock', 'store_cancel']

  const now = new Date().toISOString()
  // Partial<OrderInsert> に変換して型安全に更新
  const updateData: {
    status: OrderStatus
    accepted_at?: string
    estimated_ready_at?: string
    ready_at?: string
    no_show_at?: string
    cancelled_reason_type?: CancelledReasonType
  } = { status }

  if (status === 'cancelled') {
    const reason = STORE_CANCEL_REASONS.includes(cancelledReasonType as CancelledReasonType)
      ? (cancelledReasonType as CancelledReasonType)
      : 'store_cancel'
    updateData.cancelled_reason_type = reason
  }

  if (status === 'accepted') {
    updateData.accepted_at = now
    // waitMinutes は 1〜120 の整数のみ受け付ける（範囲外は無視）
    if (
      waitMinutes !== undefined &&
      typeof waitMinutes === 'number' &&
      Number.isInteger(waitMinutes) &&
      waitMinutes >= 1 &&
      waitMinutes <= 120
    ) {
      const estimatedReadyAt = new Date(Date.now() + waitMinutes * 60 * 1000)
      updateData.estimated_ready_at = estimatedReadyAt.toISOString()
    }
  }
  if (status === 'ready') updateData.ready_at = now
  if (status === 'no_show') updateData.no_show_at = now

  // キャンセル時：Stripe 返金を自動実行し refunded へ遷移
  if (status === 'cancelled' && order.stripe_charge_id) {
    try {
      await refundPayment(order.stripe_charge_id)
      updateData.status = 'refunded'
    } catch (e) {
      logger.error('Stripe refund error', { orderId: id, chargeId: order.stripe_charge_id, error: String(e) })
      // 返金失敗時は cancelled のまま（手動対応）
    }
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  // 顧客へプッシュ通知（仕様書 11.1）
  // 失敗してもステータス更新の応答は返す（ベストエフォート）
  const payload = PUSH_PAYLOADS[updateData.status]
  if (payload) {
    try {
      await sendPushToOrder(id, {
        ...payload,
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${id}`,
      })
    } catch (e) {
      logger.error('order push send error', { orderId: id, status: updateData.status, error: String(e) })
    }
  }

  return NextResponse.json({ order: updated })
}
