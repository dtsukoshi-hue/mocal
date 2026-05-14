import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendPushToOrder } from '@/lib/push'
import { logger } from '@/lib/logger'

// ready 状態から NO_SHOW_MINUTES 分経過した注文を no_show へ自動遷移させる cron。
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

  // ready_at が cutoff より古い ready 注文を取得
  const { data: orders, error: fetchErr } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'ready')
    .lt('ready_at', cutoff)

  if (fetchErr) {
    logger.error('cron no-show: fetch error', { code: fetchErr.code })
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  const ids = orders.map((o) => o.id)

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'no_show', no_show_at: now })
    .in('id', ids)

  if (updateErr) {
    logger.error('cron no-show: update error', { code: updateErr.code, count: ids.length })
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  // 各注文にプッシュ通知を送信（ベストエフォート）
  await Promise.allSettled(
    ids.map((id) =>
      sendPushToOrder(id, {
        title: 'お受け取り時間が経過しました',
        body: '店舗にご相談ください。',
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${id}`,
      }).catch((e) =>
        logger.error('cron no-show: push error', { orderId: id, error: String(e) })
      )
    )
  )

  logger.info('cron no-show: completed', { count: ids.length })
  return NextResponse.json({ updated: ids.length })
}
