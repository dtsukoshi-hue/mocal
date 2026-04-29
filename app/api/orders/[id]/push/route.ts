import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isUuid } from '@/lib/validation'
import { logger } from '@/lib/logger'

// POST /api/orders/[id]/push
// 顧客が注文ステータス通知を購読する。注文 UUID を持っていることがアクセス条件。
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/orders/[id]/push'>
) {
  const { id } = await ctx.params
  if (!isUuid(id)) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  let subscription: PushSubscriptionJSON
  try {
    subscription = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'サブスクリプション情報が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 注文の存在確認（UUID 知識のみが認可）
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  const { error } = await supabase
    .from('order_push_subscriptions')
    .upsert(
      {
        order_id: id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'order_id,endpoint' }
    )

  if (error) {
    logger.error('order push subscribe error', { orderId: id, code: error.code })
    return NextResponse.json({ error: '登録に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
