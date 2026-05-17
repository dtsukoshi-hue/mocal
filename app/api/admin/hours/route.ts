import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'

interface HoursInput {
  weekday: number
  is_open: boolean
  open_time: string | null
  close_time: string | null
  last_order: string | null
}

const TIME_REGEX = /^(?:2[0-3]|[01]\d):[0-5]\d(?::[0-5]\d)?$/

function validateInput(items: unknown): { ok: true; data: HoursInput[] } | { ok: false; error: string } {
  if (!Array.isArray(items)) return { ok: false, error: 'items が配列ではありません。' }
  if (items.length !== 7) return { ok: false, error: '営業時間は 7 曜日分必要です。' }

  const seen = new Set<number>()
  const out: HoursInput[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') return { ok: false, error: '要素の形式が不正です。' }
    const o = it as Record<string, unknown>
    if (typeof o.weekday !== 'number' || !Number.isInteger(o.weekday) || o.weekday < 0 || o.weekday > 6) {
      return { ok: false, error: 'weekday が不正です。' }
    }
    if (seen.has(o.weekday)) return { ok: false, error: 'weekday が重複しています。' }
    seen.add(o.weekday)
    if (typeof o.is_open !== 'boolean') return { ok: false, error: 'is_open が不正です。' }

    let openTime: string | null = null
    let closeTime: string | null = null
    let lastOrder: string | null = null

    if (o.is_open) {
      if (typeof o.open_time !== 'string' || !TIME_REGEX.test(o.open_time)) {
        return { ok: false, error: '開店時刻の形式が不正です（HH:MM）。' }
      }
      if (typeof o.close_time !== 'string' || !TIME_REGEX.test(o.close_time)) {
        return { ok: false, error: '閉店時刻の形式が不正です（HH:MM）。' }
      }
      openTime  = o.open_time
      closeTime = o.close_time
      if (o.last_order !== null && o.last_order !== undefined && o.last_order !== '') {
        if (typeof o.last_order !== 'string' || !TIME_REGEX.test(o.last_order)) {
          return { ok: false, error: 'ラストオーダーの形式が不正です（HH:MM）。' }
        }
        lastOrder = o.last_order
      }
    }

    out.push({
      weekday:    o.weekday,
      is_open:    o.is_open,
      open_time:  openTime,
      close_time: closeTime,
      last_order: lastOrder,
    })
  }
  return { ok: true, data: out }
}

// GET: 自店舗の曜日別営業時間 7 件を返す
export async function GET() {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('store_hours')
    .select('weekday, is_open, open_time, close_time, last_order')
    .eq('store_id', session.storeId)
    .order('weekday', { ascending: true })

  if (error) {
    logger.error('hours fetch error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ hours: data ?? [] })
}

// PUT: 曜日別営業時間を一括上書き
export async function PUT(request: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }
  const { hours } = body as { hours?: unknown }
  const v = validateInput(hours)
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 })
  }

  const supabase = createServiceClient()

  const rows = v.data.map((h) => ({
    store_id:   session.storeId,
    weekday:    h.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    is_open:    h.is_open,
    open_time:  h.open_time,
    close_time: h.close_time,
    last_order: h.last_order,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('store_hours')
    .upsert(rows, { onConflict: 'store_id,weekday' })

  if (error) {
    logger.error('hours upsert error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
