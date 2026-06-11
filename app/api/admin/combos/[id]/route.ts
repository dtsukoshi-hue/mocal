import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation'
import type { ComboOfferInsert } from '@/lib/database.aliases'

const MAX_NAME_LENGTH = 60
const MAX_DESC_LENGTH = 200
const MAX_ITEMS_PER_COMBO = 10
const MIN_PRICE_DELTA = -10_000
const MAX_PRICE_DELTA = 10_000

interface ComboItemInput {
  menu_item_id: string
  qty: number
}

async function authorize(id: string) {
  if (!isUuid(id)) return { error: '見つかりません', status: 404 as const }
  const session = await getStoreSession()
  if (!session) return { error: '認証が必要です。', status: 401 as const }

  const supabase = createServiceClient()
  // fail-closed: DB error 時に「権限なし」として扱う (404 で情報漏えい回避)。
  const { data: combo, error: comboError } = await supabase
    .from('combo_offers')
    .select('id, store_id')
    .eq('id', id)
    .single()
  if (comboError || !combo) return { error: '見つかりません', status: 404 as const }
  if (combo.store_id !== session.storeId) return { error: '権限がありません。', status: 403 as const }

  return { session, supabase }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/admin/combos/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Partial<{
    name: string
    description: string | null
    price_delta: number
    emoji: string | null
    is_available: boolean
    sort_order: number
    items: ComboItemInput[]
  }>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  // 部分更新の各フィールドを検証
  const update: Partial<ComboOfferInsert> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'セット名は必須です。' }, { status: 400 })
    }
    if (body.name.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `セット名は ${MAX_NAME_LENGTH} 文字以内にしてください。` }, { status: 400 })
    }
    update.name = body.name.trim()
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      update.description = null
    } else {
      if (typeof body.description !== 'string') {
        return NextResponse.json({ error: '説明文が不正です。' }, { status: 400 })
      }
      if (body.description.length > MAX_DESC_LENGTH) {
        return NextResponse.json({ error: `説明文は ${MAX_DESC_LENGTH} 文字以内にしてください。` }, { status: 400 })
      }
      update.description = body.description.trim() === '' ? null : body.description.trim()
    }
  }

  if (body.price_delta !== undefined) {
    if (typeof body.price_delta !== 'number' || !Number.isInteger(body.price_delta)) {
      return NextResponse.json({ error: '価格差分が不正です。' }, { status: 400 })
    }
    if (body.price_delta < MIN_PRICE_DELTA || body.price_delta > MAX_PRICE_DELTA) {
      return NextResponse.json({ error: '価格差分が範囲外です。' }, { status: 400 })
    }
    update.price_delta = body.price_delta
  }

  if (body.emoji !== undefined) {
    if (body.emoji === null) {
      update.emoji = null
    } else {
      if (typeof body.emoji !== 'string') {
        return NextResponse.json({ error: '絵文字が不正です。' }, { status: 400 })
      }
      update.emoji = body.emoji.trim() === '' ? null : body.emoji.trim()
    }
  }

  if (body.is_available !== undefined) {
    if (typeof body.is_available !== 'boolean') {
      return NextResponse.json({ error: 'is_available が不正です。' }, { status: 400 })
    }
    update.is_available = body.is_available
  }

  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      return NextResponse.json({ error: '並び順が不正です。' }, { status: 400 })
    }
    update.sort_order = body.sort_order
  }

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString()
    const { error } = await auth.supabase
      .from('combo_offers')
      .update(update)
      .eq('id', id)
    if (error) {
      logger.error('combo update error', { code: error.code })
      return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
    }
  }

  // items を入れ替える場合は既存を削除してから再挿入
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items が配列ではありません。' }, { status: 400 })
    }
    if (body.items.length === 0) {
      return NextResponse.json({ error: '少なくとも 1 つのメニューを含めてください。' }, { status: 400 })
    }
    if (body.items.length > MAX_ITEMS_PER_COMBO) {
      return NextResponse.json({ error: `セットに含めるメニューは ${MAX_ITEMS_PER_COMBO} 件までです。` }, { status: 400 })
    }

    const seen = new Set<string>()
    const cleanItems: ComboItemInput[] = []
    for (const it of body.items) {
      if (!it || typeof it !== 'object') return NextResponse.json({ error: 'items の要素が不正です。' }, { status: 400 })
      const o = it as unknown as Record<string, unknown>
      if (!isUuid(o.menu_item_id)) return NextResponse.json({ error: 'menu_item_id が不正です。' }, { status: 400 })
      if (typeof o.qty !== 'number' || !Number.isInteger(o.qty) || o.qty < 1 || o.qty > 99) {
        return NextResponse.json({ error: '数量が不正です。' }, { status: 400 })
      }
      const menuItemId = o.menu_item_id as string
      if (seen.has(menuItemId)) {
        return NextResponse.json({ error: 'メニューが重複しています。' }, { status: 400 })
      }
      seen.add(menuItemId)
      cleanItems.push({ menu_item_id: menuItemId, qty: o.qty })
    }

    // 自店舗のメニューであることを再確認
    const { data: ownItems } = await auth.supabase
      .from('menu_items')
      .select('id')
      .eq('store_id', auth.session.storeId)
      .in('id', cleanItems.map((c) => c.menu_item_id))
    const ownSet = new Set((ownItems ?? []).map((i) => i.id))
    if (cleanItems.some((c) => !ownSet.has(c.menu_item_id))) {
      return NextResponse.json({ error: '他店舗のメニューを含めることはできません。' }, { status: 403 })
    }

    await auth.supabase.from('combo_offer_items').delete().eq('combo_id', id)
    const { error } = await auth.supabase.from('combo_offer_items').insert(
      cleanItems.map((it) => ({ combo_id: id, menu_item_id: it.menu_item_id, qty: it.qty }))
    )
    if (error) {
      logger.error('combo items replace error', { code: error.code })
      return NextResponse.json({ error: 'メニュー構成の更新に失敗しました。' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/admin/combos/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.supabase.from('combo_offers').delete().eq('id', id)
  if (error) {
    logger.error('combo delete error', { code: error.code })
    return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  }
  // combo_offer_items は ON DELETE CASCADE で同時削除
  return NextResponse.json({ ok: true })
}
