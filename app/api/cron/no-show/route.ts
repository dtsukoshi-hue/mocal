import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { notifyOrder, notifyStore } from '@/lib/webpush'
import { startCronCheckIn } from '@/lib/sentry-cron'

// Vercel Cron / 外部スケジューラーから1分ごとに呼び出す
// Authorization: Bearer <CRON_SECRET> で保護
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
    }
  }

  // Sentry Cron Monitor (DSN 未設定なら no-op)
  const monitor = startCronCheckIn('no-show', '* * * * *')

  const supabase = createServiceClient()
  const now = new Date()
  const threshold = new Date(now.getTime() - 15 * 60 * 1000).toISOString()

  // ready → no_show（ready_at から15分以上経過）
  const { data: noShowTargets, error: fetchErr } = await supabase
    .from('orders')
    .select('id, store_id, order_number')
    .eq('status', 'ready')
    .lt('ready_at', threshold)

  if (fetchErr) {
    console.error('[cron/no-show] 対象注文取得失敗:', fetchErr)
    monitor.error()
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }

  const noShowAt = now.toISOString()
  let noShowCount = 0

  for (const order of noShowTargets ?? []) {
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'no_show', no_show_at: noShowAt })
      .eq('id', order.id)
      .eq('status', 'ready')  // 競合防止

    if (updateErr) {
      console.error('[cron/no-show] no_show 更新失敗:', order.id, updateErr)
      continue
    }

    noShowCount++
    notifyOrder(order.id, {
      title: 'お時間が経過しました',
      body: '受取可能時間を過ぎました',
      url: `/orders/${order.id}`,
    }).catch((e) => console.error('[cron/no-show] ユーザー通知失敗:', e))

    // 店舗にも未受取を通知
    notifyStore(order.store_id, {
      title: `#${order.order_number} 未受取`,
      body: '準備完了から15分経過しました。ノーショウに移行します',
      url: '/admin/dashboard',
    }).catch((e) => console.error('[cron/no-show] 店舗通知失敗:', e))
  }

  // pending タイムアウト（30分以上 pending のまま → cancelled）
  // PaymentIntent が確定しなかったケース（ユーザーがブラウザを閉じた等）
  const pendingThreshold = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const { error: pendingErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled', cancelled_reason_type: 'timeout' })
    .eq('status', 'pending')
    .lt('created_at', pendingThreshold)

  if (pendingErr) {
    console.error('[cron/no-show] pending タイムアウト更新失敗:', pendingErr)
  }

  // 時間指定注文が未受理のまま受取時刻の30分前 → 店舗にアラート（1回限り）
  // alert_30min_sent フラグで重複通知を防ぐ（cron は毎分実行されるため必須）
  const alertWindowStart = new Date(now.getTime() + 28 * 60 * 1000).toISOString()
  const alertWindowEnd   = new Date(now.getTime() + 32 * 60 * 1000).toISOString()
  const { data: alertTargets } = await supabase
    .from('orders')
    .select('id, store_id, order_number, scheduled_at')
    .eq('status', 'paid')
    .eq('pickup_type', 'scheduled')
    .eq('alert_30min_sent', false)
    .gte('scheduled_at', alertWindowStart)
    .lte('scheduled_at', alertWindowEnd)

  for (const order of alertTargets ?? []) {
    // フラグを先に立てて重複送信を防ぐ（楽観的ロック）
    const { error: flagErr } = await supabase
      .from('orders')
      .update({ alert_30min_sent: true })
      .eq('id', order.id)
      .eq('alert_30min_sent', false)  // 競合防止

    if (flagErr) continue  // 他の cron インスタンスが先に処理済み

    const timeStr = new Date(order.scheduled_at!).toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    })
    notifyStore(order.store_id, {
      title: `#${order.order_number} 受取時刻まで30分`,
      body: `${timeStr} の時間指定注文がまだ未受理です`,
      url: '/admin/dashboard',
    }).catch((e) => console.error('[cron] スケジュールアラート通知失敗:', e))
  }

  monitor.ok()
  return NextResponse.json({ ok: true, noShow: noShowCount })
}
