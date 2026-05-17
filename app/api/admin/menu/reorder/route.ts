import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation'

const MAX_ITEMS = 200

// POST /api/admin/menu/reorder
// body: { items: [{ id: uuid, sort_order: number }, ...] }
// 自店舗のメニューに対して sort_order を一括更新する
export async function POST(request: NextRequest) {
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
  const items = (body as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items が配列ではありません。' }, { status: 400 })
  }
  if (items.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 })
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `一度に並び替えできるのは ${MAX_ITEMS} 件までです。` },
      { status: 400 }
    )
  }

  // 各要素のバリデーション
  const updates: { id: string; sort_order: number }[] = []
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      return NextResponse.json({ error: '要素の形式が不正です。' }, { status: 400 })
    }
    const o = it as Record<string, unknown>
    if (!isUuid(o.id)) {
      return NextResponse.json({ error: 'id が不正です。' }, { status: 400 })
    }
    if (typeof o.sort_order !== 'number' || !Number.isInteger(o.sort_order)) {
      return NextResponse.json({ error: 'sort_order が不正です。' }, { status: 400 })
    }
    updates.push({ id: o.id, sort_order: o.sort_order })
  }

  // 重複 id 拒否
  const ids = updates.map((u) => u.id)
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: '重複した id が含まれています。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 自店舗のものだけが対象になることを確認（他店舗 id を混ぜられた場合の保護）
  const { data: ownItems, error: fetchErr } = await supabase
    .from('menu_items')
    .select('id')
    .eq('store_id', session.storeId)
    .in('id', ids)

  if (fetchErr) {
    logger.error('reorder fetch error', { code: fetchErr.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }
  const ownIdSet = new Set((ownItems ?? []).map((i) => i.id))
  const foreign = updates.filter((u) => !ownIdSet.has(u.id))
  if (foreign.length > 0) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  // 個別 UPDATE をループ。Supabase JS は bulk update with different values をサポートしないため。
  // N=200 程度なので REST 経由で許容範囲。
  const errors: string[] = []
  await Promise.all(
    updates.map(async (u) => {
      const { error } = await supabase
        .from('menu_items')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id)
        .eq('store_id', session.storeId)
      if (error) errors.push(error.message)
    })
  )

  if (errors.length > 0) {
    logger.error('reorder partial failure', { count: errors.length, sample: errors[0] })
    return NextResponse.json(
      { error: '一部の更新に失敗しました。' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, updated: updates.length })
}
