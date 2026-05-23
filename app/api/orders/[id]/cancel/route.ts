import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createServiceClient } from '@/lib/supabase-server'
import { refundPayment } from '@/lib/payment'
import { logger } from '@/lib/logger'
import { sendPushToOrder } from '@/lib/push'
import { isUuid } from '@/lib/validation'
import { checkRateLimitAsync } from '@/lib/rate-limit'

// 顧客による注文キャンセル
// POST /api/orders/[id]/cancel
//
// 認可: anonymous sign-in でも user.id が確立しているため、
//       auth.uid() === order.user_id を verify する。
// 対象: paid ステータスのみ（accepted 以降は店舗側でしかキャンセル不可）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('order-cancel', ip, 5, 60_000))) {
    return NextResponse.json({ error: 'しばらく時間をおいてから再度お試しください。' }, { status: 429 })
  }

  if (!isUuid(id)) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, user_id, stripe_charge_id')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  if (order.user_id !== user.id) {
    return NextResponse.json({ error: 'この注文をキャンセルする権限がありません。' }, { status: 403 })
  }

  if (order.status !== 'paid') {
    return NextResponse.json(
      { error: '受付済みの注文はキャンセルできません。店舗にお問い合わせください。' },
      { status: 422 }
    )
  }

  let nextStatus: 'cancelled' | 'refunded' = 'cancelled'

  if (order.stripe_charge_id) {
    try {
      await refundPayment(order.stripe_charge_id)
      nextStatus = 'refunded'
    } catch (e) {
      logger.error('customer cancel refund error', { orderId: id, error: String(e) })
      // 返金失敗時は cancelled のまま記録（手動対応）
    }
  }

  // eq paid フィルタで二重送信を防ぐ（既に他経路で update されていれば 0 行更新）
  const { error: updateErr, data: updated } = await supabase
    .from('orders')
    .update({ status: nextStatus, cancelled_reason_type: 'user_cancel' })
    .eq('id', id)
    .eq('status', 'paid')
    .select('id')

  if (updateErr) {
    logger.error('customer cancel update error', { orderId: id, error: updateErr.message })
    return NextResponse.json({ error: 'キャンセルに失敗しました。' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    // 競合（他経路で先に状態が変わった）
    return NextResponse.json(
      { error: '注文の状態が変わったため、キャンセルできませんでした。' },
      { status: 409 }
    )
  }

  try {
    await sendPushToOrder(id, {
      title: '注文をキャンセルしました',
      body: nextStatus === 'refunded' ? '返金処理が完了しました。' : 'キャンセルを受け付けました。',
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${id}`,
    })
  } catch (e) {
    logger.error('customer cancel push error', { orderId: id, error: String(e) })
  }

  return NextResponse.json({ status: nextStatus })
}
