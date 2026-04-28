import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'
import type { StoreInsert } from '@/lib/database.types'

const VALID_WAIT_MINUTES = [10, 15, 20, 30, 40, 60] as const
type WaitMinutes = typeof VALID_WAIT_MINUTES[number]
const MAX_NAME_LENGTH = 60

type StoreUpdate = Partial<Pick<StoreInsert, 'is_open' | 'name' | 'wait_minutes'>>

function validateUpdate(body: unknown): { ok: true; data: StoreUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'リクエストが不正です。' }
  const b = body as Record<string, unknown>

  const out: StoreUpdate = {}

  if ('is_open' in b) {
    if (typeof b.is_open !== 'boolean') return { ok: false, error: 'is_open が不正です。' }
    out.is_open = b.is_open
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

  if (Object.keys(out).length === 0) {
    return { ok: false, error: '更新内容が指定されていません。' }
  }

  return { ok: true, data: out }
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

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('stores')
    .update(validation.data)
    .eq('id', session.storeId)

  if (error) {
    logger.error('store update error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...validation.data })
}
