import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { startCronCheckIn } from '@/lib/sentry-cron'

// 外部スケジューラ (cron-job.org 等) から 5 分ごとに呼び出す
// Authorization: Bearer <CRON_SECRET> で保護
export async function GET(request: NextRequest) {
  // CRON_SECRET 必須化 (#48 code-review finding 5)
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が設定されていません。' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  // Sentry Cron Monitor (DSN 未設定なら no-op)
  // schedule は cron-job.org / 外部スケジューラ の実 schedule と一致させる
  // (Sentry の expected schedule、不一致だと missed runs alert が出る)
  const monitor = startCronCheckIn('store-hours', '0 * * * *')

  const supabase = createServiceClient()
  const now = new Date()

  // JST での現在時刻を取得
  const jstFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    weekday: 'long',    // 'Sunday' など
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const jstParts = jstFormatter.formatToParts(now)
  const weekdayStr = jstParts.find(p => p.type === 'weekday')?.value ?? 'Sunday'
  const hourStr    = jstParts.find(p => p.type === 'hour')?.value   ?? '0'
  const minuteStr  = jstParts.find(p => p.type === 'minute')?.value ?? '0'

  const DOW_MAP: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  }
  const dowJST = (DOW_MAP[weekdayStr] ?? 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6
  const currentTimeStr = `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}`

  // 全店舗の今日の営業時間を一括取得（N+1 を避けるため結合クエリ）
  const { data: storeHours, error: fetchErr } = await supabase
    .from('store_hours')
    .select('store_id, open_time, close_time, is_open')
    .eq('weekday', dowJST)

  if (fetchErr) {
    console.error('[cron/store-hours] store_hours 取得失敗:', fetchErr)
    monitor.error()
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }

  // 現在時刻が営業時間内かを判定
  // manual_override_until が今より未来のものはスキップ（手動設定優先）
  const nowIso = now.toISOString()

  const toOpen:  string[] = []
  const toClose: string[] = []

  for (const sh of storeHours ?? []) {
    const shouldBeOpen = sh.is_open
      && sh.open_time !== null
      && sh.close_time !== null
      && currentTimeStr >= sh.open_time
      && currentTimeStr < sh.close_time

    if (shouldBeOpen) {
      toOpen.push(sh.store_id)
    } else {
      toClose.push(sh.store_id)
    }
  }

  // manual_override_until が有効な店舗はスキップ
  // → stores を一括取得して除外
  if (toOpen.length === 0 && toClose.length === 0) {
    monitor.ok()
    return NextResponse.json({ ok: true, opened: 0, closed: 0 })
  }

  const allStoreIds = [...new Set([...toOpen, ...toClose])]
  const { data: overrideStores } = await supabase
    .from('stores')
    .select('id, is_open, manual_override_until')
    .in('id', allStoreIds)

  const overrideMap = new Map(
    (overrideStores ?? []).map(s => [s.id, s])
  )

  // manual_override_until が未来 → スキップ（手動設定が優先）
  const filteredOpen  = toOpen.filter(id => {
    const s = overrideMap.get(id)
    return !s?.manual_override_until || s.manual_override_until < nowIso
  })
  const filteredClose = toClose.filter(id => {
    const s = overrideMap.get(id)
    return !s?.manual_override_until || s.manual_override_until < nowIso
  })

  // すでに正しい状態のものは除外（不要な UPDATE を避ける）
  const needOpen  = filteredOpen.filter(id  => overrideMap.get(id)?.is_open === false)
  const needClose = filteredClose.filter(id => overrideMap.get(id)?.is_open === true)

  const results = await Promise.allSettled([
    needOpen.length > 0
      ? supabase.from('stores').update({ is_open: true  }).in('id', needOpen)
      : Promise.resolve(null),
    needClose.length > 0
      ? supabase.from('stores').update({ is_open: false }).in('id', needClose)
      : Promise.resolve(null),
  ])

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[cron/store-hours] 更新失敗:', r.reason)
    } else if (r.value && 'error' in r.value && r.value.error) {
      console.error('[cron/store-hours] 更新エラー:', r.value.error)
    }
  }

  monitor.ok()
  return NextResponse.json({
    ok: true,
    dow: dowJST,
    time: currentTimeStr,
    opened: needOpen.length,
    closed: needClose.length,
  })
}
