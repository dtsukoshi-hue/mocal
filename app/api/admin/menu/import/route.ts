import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'

const MAX_ROWS = 200
const MAX_NAME_LENGTH = 60
const MAX_PRICE = 999_999
const MAX_CATEGORY_LENGTH = 30
const MAX_EMOJI_LENGTH = 4
const MAX_DESC_LENGTH = 200

interface ImportRow {
  name: string
  price: number
  category?: string
  description?: string
  emoji?: string
}

// POST /api/admin/menu/import
// body: { items: ImportRow[] }
// Batch-inserts menu items for the authenticated store.
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

  const rawItems = (body as { items?: unknown }).items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: 'インポートするデータがありません。' }, { status: 400 })
  }
  if (rawItems.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `一度にインポートできるのは ${MAX_ROWS} 件までです。` },
      { status: 400 }
    )
  }

  const rows: ImportRow[] = []
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i]
    if (!it || typeof it !== 'object') {
      return NextResponse.json({ error: `${i + 1} 行目のデータが不正です。` }, { status: 400 })
    }
    const o = it as Record<string, unknown>

    // name
    if (typeof o.name !== 'string' || o.name.trim() === '') {
      return NextResponse.json({ error: `${i + 1} 行目: メニュー名は必須です。` }, { status: 400 })
    }
    if (o.name.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `${i + 1} 行目: メニュー名は ${MAX_NAME_LENGTH} 文字以内にしてください。` },
        { status: 400 }
      )
    }

    // price
    const price = typeof o.price === 'string' ? parseInt(o.price, 10) : Number(o.price)
    if (!Number.isInteger(price) || price < 0) {
      return NextResponse.json({ error: `${i + 1} 行目: 価格が不正です。` }, { status: 400 })
    }
    if (price > MAX_PRICE) {
      return NextResponse.json(
        { error: `${i + 1} 行目: 価格は ${MAX_PRICE.toLocaleString()} 円以下にしてください。` },
        { status: 400 }
      )
    }

    // category (optional)
    const category = typeof o.category === 'string' ? o.category.trim() : ''
    if (category.length > MAX_CATEGORY_LENGTH) {
      return NextResponse.json(
        { error: `${i + 1} 行目: カテゴリは ${MAX_CATEGORY_LENGTH} 文字以内にしてください。` },
        { status: 400 }
      )
    }

    // description (optional)
    const description = typeof o.description === 'string' ? o.description.trim() : ''
    if (description.length > MAX_DESC_LENGTH) {
      return NextResponse.json(
        { error: `${i + 1} 行目: 説明文は ${MAX_DESC_LENGTH} 文字以内にしてください。` },
        { status: 400 }
      )
    }

    // emoji (optional)
    const emoji = typeof o.emoji === 'string' ? o.emoji.trim() : ''
    if (emoji.length > MAX_EMOJI_LENGTH) {
      return NextResponse.json(
        { error: `${i + 1} 行目: 絵文字が長すぎます。` },
        { status: 400 }
      )
    }

    rows.push({
      name: o.name.trim(),
      price,
      category: category || undefined,
      description: description || undefined,
      emoji: emoji || undefined,
    })
  }

  const supabase = createServiceClient()

  // Fetch current max sort_order so imported items go to the end
  const { data: maxRow } = await supabase
    .from('menu_items')
    .select('sort_order')
    .eq('store_id', session.storeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseOrder = (maxRow?.sort_order ?? 0) + 10

  const inserts = rows.map((row, i) => ({
    store_id: session.storeId,
    name: row.name,
    price: row.price,
    category: row.category ?? null,
    description: row.description ?? null,
    emoji: row.emoji ?? null,
    is_available: true,
    sort_order: baseOrder + i * 10,
  }))

  const { error } = await supabase.from('menu_items').insert(inserts)

  if (error) {
    logger.error('menu import error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: 'インポートに失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, imported: inserts.length }, { status: 201 })
}
