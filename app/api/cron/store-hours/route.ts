import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { logger } from '@/lib/logger'

// Vercel Cron: 5分ごとに実行 (vercel.json で設定)
// 各店舗の store_hours を参照し is_open を自動更新する。
// manual_override_until が未来の場合はその店舗をスキップ（手動操作を優先）。
export async function GET(request: Request) {
  // Vercel Cron 認証: Authorization: Bearer CRON_SECRET
  const auth = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  // JST (UTC+9) で曜日・現在時刻を取得
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const weekday = jst.getUTCDay() // 0=日, 1=月, ..., 6=土
  const currentHHMM = jst.toISOString().slice(11, 16) // 'HH:MM'
  const nowIso = now.toISOString()

  // 全店舗を取得
  const { data: stores, error: storeErr } = await supabase
    .from('stores')
    .select('id, is_open, manual_override_until')

  if (storeErr) {
    logger.error('cron store-hours: fetch stores error', { code: storeErr.code })
    return NextResponse.json({ error: 'fetch stores failed' }, { status: 500 })
  }
  if (!stores || stores.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // manual_override_until が未来の店舗は除外
  const targets = stores.filter(
    (s) => !s.manual_override_until || s.manual_override_until <= nowIso
  )

  if (targets.length === 0) {
    return NextResponse.json({ updated: 0, skipped: stores.length })
  }

  const storeIds = targets.map((s) => s.id)

  // 対象店舗の当日 store_hours を取得
  const { data: hours, error: hoursErr } = await supabase
    .from('store_hours')
    .select('store_id, is_open, open_time, close_time, last_order')
    .in('store_id', storeIds)
    .eq('weekday', weekday)

  if (hoursErr) {
    logger.error('cron store-hours: fetch hours error', { code: hoursErr.code })
    return NextResponse.json({ error: 'fetch hours failed' }, { status: 500 })
  }

  const hoursMap = new Map<string, typeof hours[number]>()
  for (const h of hours ?? []) {
    hoursMap.set(h.store_id, h)
  }

  // 各店舗の新しい is_open を計算
  type Update = { id: string; shouldBeOpen: boolean; currentIsOpen: boolean }
  const updates: Update[] = []

  for (const store of targets) {
    const h = hoursMap.get(store.id)

    let shouldBeOpen = false
    if (h?.is_open && h.open_time && h.close_time) {
      // ラストオーダーがあれば close_time の代わりに使う（注文受付の終了時刻）
      const cutoff = h.last_order ?? h.close_time
      shouldBeOpen = currentHHMM >= h.open_time && currentHHMM < cutoff
    }

    if (shouldBeOpen !== store.is_open) {
      updates.push({ id: store.id, shouldBeOpen, currentIsOpen: store.is_open })
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ updated: 0, skipped: stores.length - targets.length })
  }

  // open → close と close → open を分けて一括更新
  const toOpen  = updates.filter((u) => u.shouldBeOpen).map((u) => u.id)
  const toClose = updates.filter((u) => !u.shouldBeOpen).map((u) => u.id)

  const errors: string[] = []

  if (toOpen.length > 0) {
    const { error } = await supabase
      .from('stores')
      .update({ is_open: true })
      .in('id', toOpen)
    if (error) {
      logger.error('cron store-hours: open update error', { code: error.code })
      errors.push('open update failed')
    }
  }

  if (toClose.length > 0) {
    const { error } = await supabase
      .from('stores')
      .update({ is_open: false })
      .in('id', toClose)
    if (error) {
      logger.error('cron store-hours: close update error', { code: error.code })
      errors.push('close update failed')
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(', ') }, { status: 500 })
  }

  logger.info('cron store-hours: completed', {
    total: stores.length,
    skipped: stores.length - targets.length,
    opened: toOpen.length,
    closed: toClose.length,
    weekday,
    currentHHMM,
  })

  return NextResponse.json({
    updated: updates.length,
    opened: toOpen.length,
    closed: toClose.length,
    skipped: stores.length - targets.length,
  })
}
