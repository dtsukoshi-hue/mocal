import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { isUuid } from '@/lib/validation'
import type { MenuItemInsert } from '@/lib/database.aliases'

async function authorize(id: string) {
  if (!isUuid(id)) return { error: '見つかりません', status: 404 }
  const session = await getStoreSession()
  if (!session) return { error: '認証が必要です。', status: 401 }
  const supabase = createServiceClient()
  // fail-closed: DB error 時に「権限なし」として扱う (404 で情報漏えい回避)。
  const { data: item, error: itemError } = await supabase
    .from('menu_items')
    .select('id, store_id')
    .eq('id', id)
    .single()
  if (itemError || !item) return { error: '見つかりません', status: 404 }
  if (item.store_id !== session.storeId) return { error: '権限がありません。', status: 403 }
  return { session, supabase }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/admin/menu/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Partial<{ name: string; price: number; description: string; category: string; emoji: string; is_available: boolean; sort_order: number }>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
    return NextResponse.json({ error: 'メニュー名は必須です。' }, { status: 400 })
  }
  if (body.name !== undefined && typeof body.name === 'string' && body.name.trim().length > 60) {
    return NextResponse.json({ error: 'メニュー名は60文字以内にしてください。' }, { status: 400 })
  }
  if (body.price !== undefined && (typeof body.price !== 'number' || body.price < 0 || !Number.isInteger(body.price))) {
    return NextResponse.json({ error: '価格が不正です。' }, { status: 400 })
  }
  if (body.price !== undefined && typeof body.price === 'number' && body.price > 999_999) {
    return NextResponse.json({ error: '価格は999,999円以下にしてください。' }, { status: 400 })
  }
  if (body.description !== undefined && typeof body.description === 'string' && body.description.length > 200) {
    return NextResponse.json({ error: '説明文は200文字以内にしてください。' }, { status: 400 })
  }
  if (body.category !== undefined && typeof body.category === 'string' && body.category.trim().length > 30) {
    return NextResponse.json({ error: 'カテゴリは30文字以内にしてください。' }, { status: 400 })
  }
  if (body.emoji !== undefined && typeof body.emoji === 'string' && body.emoji.trim().length > 4) {
    return NextResponse.json({ error: '絵文字が長すぎます。' }, { status: 400 })
  }

  const updateData: Partial<MenuItemInsert> = {}
  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.price !== undefined) updateData.price = body.price
  if (body.description !== undefined) updateData.description = body.description.trim() || null
  if (body.category !== undefined) updateData.category = body.category.trim() || null
  if (body.emoji !== undefined) updateData.emoji = body.emoji.trim() || null
  if (body.is_available !== undefined) updateData.is_available = body.is_available
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

  const { data, error } = await auth.supabase
    .from('menu_items')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/admin/menu/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.supabase
    .from('menu_items')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
