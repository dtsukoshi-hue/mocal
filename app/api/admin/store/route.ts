import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'
import type { StoreInsert } from '@/lib/database.types'

const VALID_WAIT_MINUTES = [10, 15, 20, 30, 40, 60] as const
type WaitMinutes = typeof VALID_WAIT_MINUTES[number]
const MAX_NAME_LENGTH = 60

type StoreUpdate = Partial<
  Pick<StoreInsert, 'is_open' | 'name' | 'wait_minutes' | 'manual_override_until' | 'area' | 'cuisine_type'>
>

interface ValidatedUpdate {
  data: StoreUpdate
  /** is_open を更新するときに自動オーバーライドを掛けるか */
  setAutoOverride: boolean
  /** 明示的にオーバーライド解除リクエストか */
  clearOverride: boolean
}

function validateUpdate(body: unknown): { ok: true; result: ValidatedUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'リクエストが不正です。' }
  const b = body as Record<string, unknown>

  const out: StoreUpdate = {}
  let setAutoOverride = false
  let clearOverride = false

  if ('is_open' in b) {
    if (typeof b.is_open !== 'boolean') return { ok: false, error: 'is_open が不正です。' }
    out.is_open = b.is_open
    setAutoOverride = true
  }

  if ('name' in b) {
    if (typeof b.name !== 'string') return { ok: false, error: '店舗名が不正です。' }
    const trimmed = b.name.trim()
    if (trimmed === '') return { ok: false, error: '店舗名を入力してください。' }
    if (trimmed.length > MAX_NAME_LENGTH) return { ok: false, error: `店舗名は ${MAX_NAME_LENGTH} 文字以内にしてください。` }
    out.name = trimmed
  }

  if ('wait_minutes' in b) {
    if (typeof b.wait_minutes !== 'number' || !Number.isInteger(b.wait_minutes)) {
      return { ok: false, error: '待ち時間が不正です。' }
    }
    if (!VALID_WAIT_MINUTES.includes(b.wait_minutes as WaitMinutes)) {
      return { ok: false, error: `待ち時間は ${VALID_WAIT_MINUTES.join(', ')} 分のいずれかを指定してください。` }
    }
    out.wait_minutes = b.wait_minutes as WaitMinutes
  }

  if ('area' in b) {
    if (b.area !== null && typeof b.area !== 'string') {
      return { ok: false, error: 'エリアが不正です。' }
    }
    if (typeof b.area === 'string') {
      const trimmed = b.area.trim()
      if (trimmed.length > 30) return { ok: false, error: 'エリアは 30 文字以内にしてください。' }
      out.area = trimmed === '' ? null : trimmed
    } else {
      out.area = null
    }
  }

  if ('cuisine_type' in b) {
    if (b.cuisine_type !== null && typeof b.cuisine_type !== 'string') {
      return { ok: false, error: 'ジャンルが不正です。' }
    }
    if (typeof b.cuisine_type === 'string') {
      const trimmed = b.cuisine_type.trim()
      if (trimmed.length > 30) return { ok: false, error: 'ジャンルは 30 文字以内にしてください。' }
      out.cuisine_type = trimmed === '' ? null : trimmed
    } else {
      out.cuisine_type = null
    }
  }

  if ('clear_override' in b) {
    if (typeof b.clear_override !== 'boolean') {
      return { ok: false, error: 'clear_override が不正です。' }
    }
    if (b.clear_override) {
      clearOverride = true
    }
  }

  if (Object.keys(out).length === 0 && !clearOverride) {
    return { ok: false, error: '更新内容が指定されていません。' }
  }

  return { ok: true, result: { data: out, setAutoOverride, clearOverride } }
}

/**
 * JST 当日の終わり（翌日 00:00:00 JST = 当日 23:59:59 + 1秒）を ISO 文字列で返す。
 * 手動オーバーライドが切れる時刻として使用する。
 */
function endOfTodayJstIso(): string {
  // JST 表示の現在時刻を作る
  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  // JST の年月日を取り出して翌日 00:00 を作る
  const jstYear  = jstNow.getUTCFullYear()
  const jstMonth = jstNow.getUTCMonth()
  const jstDate  = jstNow.getUTCDate()
  // 翌日 00:00 JST = 翌日 -9h UTC = 当日 15:00 UTC
  const nextJstMidnightUtc = Date.UTC(jstYear, jstMonth, jstDate + 1, -9, 0, 0)
  return new Date(nextJstMidnightUtc).toISOString()
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const validation = validateUpdate(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { data, setAutoOverride, clearOverride } = validation.result

  // is_open を変更する場合 → 手動オーバーライドを当日終了まで設定
  // clear_override が指定された場合 → null にして自動制御に戻す
  if (clearOverride) {
    data.manual_override_until = null
  } else if (setAutoOverride) {
    data.manual_override_until = endOfTodayJstIso()
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('stores')
    .update(data)
    .eq('id', session.storeId)

  if (error) {
    logger.error('store update error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...data })
}
