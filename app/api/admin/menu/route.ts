import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'

export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { name: string; price: number; category?: string; emoji?: string; sort_order?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { name, price, category, emoji, sort_order } = body

  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'メニュー名は必須です。' }, { status: 400 })
  }
  if (typeof price !== 'number' || price < 0 || !Number.isInteger(price)) {
    return NextResponse.json({ error: '価格が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      store_id: session.storeId,
      name: name.trim(),
      price,
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
