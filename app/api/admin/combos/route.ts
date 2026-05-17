import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation'

const MAX_NAME_LENGTH = 60
const MAX_DESC_LENGTH = 200
const MAX_ITEMS_PER_COMBO = 10
const MIN_PRICE_DELTA = -10_000
const MAX_PRICE_DELTA = 10_000

interface ComboItemInput {
  menu_item_id: string
  qty: number
}

interface ComboCreateInput {
  name: string
  description: string | null
  price_delta: number
  emoji: string | null
  is_available: boolean
  sort_order: number
  items: ComboItemInput[]
}

function validateBody(body: unknown): { ok: true; data: ComboCreateInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'リクエストが不正です。' }
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || b.name.trim() === '') {
    return { ok: false, error: 'セット名は必須です。' }
  }
  if (b.name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, error: `セット名は ${MAX_NAME_LENGTH} 文字以内にしてください。` }
  }

  let description: string | null = null
  if (b.description !== null && b.description !== undefined) {
    if (typeof b.description !== 'string') {
      return { ok: false, error: '説明文が不正です。' }
    }
    if (b.description.length > MAX_DESC_LENGTH) {
      return { ok: false, error: `説明文は ${MAX_DESC_LENGTH} 文字以内にしてください。` }
    }
    description = b.description.trim() === '' ? null : b.description.trim()
  }

  if (typeof b.price_delta !== 'number' || !Number.isInteger(b.price_delta)) {
    return { ok: false, error: '価格差分が不正です。' }
  }
  if (b.price_delta < MIN_PRICE_DELTA || b.price_delta > MAX_PRICE_DELTA) {
    return { ok: false, error: `価格差分は ${MIN_PRICE_DELTA} 〜 ${MAX_PRICE_DELTA} の範囲で指定してください。` }
  }

  let emoji: string | null = null
  if (typeof b.emoji === 'string' && b.emoji.trim() !== '') {
    if (b.emoji.length > 4) {
      return { ok: false, error: '絵文字が長すぎます。' }
    }
    emoji = b.emoji.trim()
  }

  const isAvailable = b.is_available === undefined ? true : !!b.is_available
  const sortOrder = typeof b.sort_order === 'number' && Number.isInteger(b.sort_order) ? b.sort_order : 0

  if (!Array.isArray(b.items)) {
    return { ok: false, error: 'items が配列ではありません。' }
  }
  if (b.items.length === 0) {
    return { ok: false, error: '少なくとも 1 つのメニューを含めてください。' }
  }
  if (b.items.length > MAX_ITEMS_PER_COMBO) {
    return { ok: false, error: `セットに含めるメニューは ${MAX_ITEMS_PER_COMBO} 件までです。` }
  }

  const seen = new Set<string>()
  const items: ComboItemInput[] = []
  for (const it of b.items) {
    if (!it || typeof it !== 'object') return { ok: false, error: 'items の要素が不正です。' }
    const o = it as Record<string, unknown>
    if (!isUuid(o.menu_item_id)) {
      return { ok: false, error: 'menu_item_id が不正です。' }
    }
    if (typeof o.qty !== 'number' || !Number.isInteger(o.qty) || o.qty < 1 || o.qty > 99) {
      return { ok: false, error: '数量は 1〜99 の整数で指定してください。' }
    }
    if (seen.has(o.menu_item_id as string)) {
      return { ok: false, error: '同じメニューが重複しています。' }
    }
    seen.add(o.menu_item_id as string)
    items.push({ menu_item_id: o.menu_item_id as string, qty: o.qty })
  }

  return {
    ok: true,
    data: {
      name: b.name.trim(),
      description,
      price_delta: b.price_delta,
      emoji,
      is_available: isAvailable,
      sort_order: sortOrder,
      items,
    },
  }
}

// GET: 自店舗のコンボ一覧（含まれるアイテム ID と数量も含む）
export async function GET() {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: combos, error: c1 } = await supabase
    .from('combo_offers')
    .select('id, name, description, price_delta, emoji, is_available, sort_order')
    .eq('store_id', session.storeId)
    .order('sort_order', { ascending: true })

  if (c1) {
    logger.error('combos fetch error', { storeId: session.storeId, code: c1.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  const comboIds = (combos ?? []).map((c) => c.id)
  const itemsByCombo = new Map<string, { menu_item_id: string; qty: number }[]>()

  if (comboIds.length > 0) {
    const { data: items, error: c2 } = await supabase
      .from('combo_offer_items')
      .select('combo_id, menu_item_id, qty')
      .in('combo_id', comboIds)

    if (c2) {
      logger.error('combo_offer_items fetch error', { storeId: session.storeId, code: c2.code })
      return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
    }

    for (const it of items ?? []) {
      const arr = itemsByCombo.get(it.combo_id) ?? []
      arr.push({ menu_item_id: it.menu_item_id, qty: it.qty })
      itemsByCombo.set(it.combo_id, arr)
    }
  }

  const result = (combos ?? []).map((c) => ({
    ...c,
    items: itemsByCombo.get(c.id) ?? [],
  }))

  return NextResponse.json({ combos: result })
}

// POST: 新規コンボ作成
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

  const v = validateBody(body)
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 含まれる menu_items が自店舗のものであることを確認
  const itemIds = v.data.items.map((i) => i.menu_item_id)
  const { data: ownItems } = await supabase
    .from('menu_items')
    .select('id')
    .eq('store_id', session.storeId)
    .in('id', itemIds)
  const ownSet = new Set((ownItems ?? []).map((i) => i.id))
  if (itemIds.some((id) => !ownSet.has(id))) {
    return NextResponse.json({ error: '他店舗のメニューを含めることはできません。' }, { status: 403 })
  }

  // 1) combo_offers 作成
  const { data: created, error: e1 } = await supabase
    .from('combo_offers')
    .insert({
      store_id: session.storeId,
      name: v.data.name,
      description: v.data.description,
      price_delta: v.data.price_delta,
      emoji: v.data.emoji,
      is_available: v.data.is_available,
      sort_order: v.data.sort_order,
    })
    .select()
    .single()

  if (e1 || !created) {
    logger.error('combo create error', { code: e1?.code })
    return NextResponse.json({ error: '作成に失敗しました。' }, { status: 500 })
  }

  // 2) combo_offer_items 作成
  const { error: e2 } = await supabase
    .from('combo_offer_items')
    .insert(v.data.items.map((it) => ({
      combo_id: created.id,
      menu_item_id: it.menu_item_id,
      qty: it.qty,
    })))

  if (e2) {
    logger.error('combo items create error', { code: e2.code })
    // 作成済みコンボをクリーンアップ
    await supabase.from('combo_offers').delete().eq('id', created.id)
    return NextResponse.json({ error: '作成に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ combo: { ...created, items: v.data.items } }, { status: 201 })
}
