import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendPushToOrder } from '@/lib/push'
import { logger } from '@/lib/logger'

// ready 状態から NO_SHOW_MINUTES 分経過した注文を no_show へ自動遷移させる cron。
// pg_cron が DB 側で同じ遷移を行うが Push 通知を送れないため、
// Vercel cron がプッシュ通知の送信も担う。
// Vercel Cron: 5分ごとに実行 (vercel.json で設定)
const NO_SHOW_MINUTES = 15

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - NO_SHOW_MINUTES * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  // Case 1: まだ ready のまま期限切れ → no_show に遷移してプッシュ送信
  const { data: readyOrders, error: fetchErr } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'ready')
    .lt('ready_at', cutoff)

  if (fetchErr) {
    logger.error('cron no-show: fetch ready error', { code: fetchErr.code })
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }

  let transitioned = 0
  if (readyOrders && readyOrders.length > 0) {
    const ids = readyOrders.map((o) => o.id)
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'no_show', no_show_at: now, no_show_push_sent: true })
      .in('id', ids)

    if (updateErr) {
      logger.error('cron no-show: transition error', { code: updateErr.code, count: ids.length })
      return NextResponse.json({ error: 'transition failed' }, { status: 500 })
    }

    transitioned = ids.length
    await Promise.allSettled(
      ids.map((id) =>
        sendPushToOrder(id, {
          title: 'お受け取り時間が経過しました',
          body: '店舗にご相談ください。',
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${id}`,
        }).catch((e) =>
          logger.error('cron no-show: push error (transition)', { orderId: id, error: String(e) })
        )
      )
    )
  }

  // Case 2: pg_cron がすでに no_show に遷移済みだが push 未送信の注文
  const { data: pendingPush, error: pendingErr } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'no_show')
    .eq('no_show_push_sent', false)

  if (pendingErr) {
    logger.error('cron no-show: fetch pending push error', { code: pendingErr.code })
    // プッシュ未送信の拾い上げ失敗はエラーレスポンスを返さずログのみ
  } else if (pendingPush && pendingPush.length > 0) {
    const ids = pendingPush.map((o) => o.id)

    // 送信済みとしてマーク（送信失敗してもフラグは立てる — 無限リトライ防止）
    await supabase
      .from('orders')
      .update({ no_show_push_sent: true })
      .in('id', ids)

    await Promise.allSettled(
      ids.map((id) =>
        sendPushToOrder(id, {
          title: 'お受け取り時間が経過しました',
          body: '店舗にご相談ください。',
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${id}`,
        }).catch((e) =>
          logger.error('cron no-show: push error (catch-up)', { orderId: id, error: String(e) })
        )
      )
    )

    logger.info('cron no-show: catch-up push sent', { count: ids.length })
  }

  logger.info('cron no-show: completed', { transitioned, catchUp: pendingPush?.length ?? 0 })
  return NextResponse.json({ transitioned, catchUp: pendingPush?.length ?? 0 })
}
