import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'

const MAX_NAME_LENGTH = 60
const MAX_PRICE = 999_999 // 100万円未満
const MAX_CATEGORY_LENGTH = 30
const MAX_EMOJI_LENGTH = 4

export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { name: string; price: number; description?: string; category?: string; emoji?: string; sort_order?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { name, price, description, category, emoji, sort_order } = body

  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'メニュー名は必須です。' }, { status: 400 })
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `メニュー名は ${MAX_NAME_LENGTH} 文字以内にしてください。` }, { status: 400 })
  }
  if (typeof price !== 'number' || price < 0 || !Number.isInteger(price)) {
    return NextResponse.json({ error: '価格が不正です。' }, { status: 400 })
  }
  if (price > MAX_PRICE) {
    return NextResponse.json({ error: `価格は ${MAX_PRICE.toLocaleString()} 円以下にしてください。` }, { status: 400 })
  }
  if (description !== undefined && typeof description === 'string' && description.length > 200) {
    return NextResponse.json({ error: '説明文は200文字以内にしてください。' }, { status: 400 })
  }
  if (category !== undefined && typeof category === 'string' && category.trim().length > MAX_CATEGORY_LENGTH) {
    return NextResponse.json({ error: `カテゴリは ${MAX_CATEGORY_LENGTH} 文字以内にしてください。` }, { status: 400 })
  }
  if (emoji !== undefined && typeof emoji === 'string' && emoji.trim().length > MAX_EMOJI_LENGTH) {
    return NextResponse.json({ error: '絵文字が長すぎます。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      store_id: session.storeId,
      name: name.trim(),
      price,
      description: description?.trim() || null,
      category: category?.trim() || null,
      emoji: emoji?.trim() || null,
      sort_order: sort_order ?? 0,
      is_available: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '作成に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
