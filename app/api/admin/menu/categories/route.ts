import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'

const MAX_NAME_LENGTH = 30

// POST /api/admin/menu/categories: 既存カテゴリ「from」を持つ全メニューを「to」にリネーム
// from が空文字なら「カテゴリ未設定」のアイテムをまとめて「to」に分類できる
export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { from?: unknown; to?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (typeof body.from !== 'string' || typeof body.to !== 'string') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const fromVal = body.from.trim()
  const toVal = body.to.trim()

  if (toVal.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `カテゴリ名は ${MAX_NAME_LENGTH} 文字以内にしてください。` },
      { status: 400 }
    )
  }

  if (fromVal === toVal) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  const supabase = createServiceClient()
  const newCategory = toVal === '' ? null : toVal

  // 自店舗のみ更新（他店舗の混入を防ぐ）
  let query = supabase
    .from('menu_items')
    .update({ category: newCategory })
    .eq('store_id', session.storeId)

  if (fromVal === '') {
    // null と「空文字」両方をまとめてリネーム対象にする
    query = query.or('category.is.null,category.eq.')
  } else {
    query = query.eq('category', fromVal)
  }

  const { error, data } = await query.select('id')

  if (error) {
    logger.error('category rename error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 })
}
