import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

// 顧客の注文履歴照会エンドポイント
// クライアント側 localStorage に保存された注文 ID のリストを受け取り、
// 各注文の最新ステータス・概要を返す。
//
// セキュリティ:
// - 注文 ID（UUID v4）は予測困難なベアラトークンとして機能
// - サーバー側に order_number 検索 API を作らないことで列挙攻撃を防ぐ
// - 各 ID を厳密に UUID バリデート、最大 20 件に制限
// - IP ベースのレート制限を追加
// - 返却するフィールドは表示に必要な最小限のみ
//   （store_id, user_id, stripe_* など内部的な ID は含めない）

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 20

export async function POST(request: NextRequest) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(`order-lookup:${ip}`, 30, 60_000)) {
    return NextResponse.json(
      { error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { ids?: unknown }).ids)
  ) {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const rawIds = (body as { ids: unknown[] }).ids

  // 文字列かつ UUID 形式のみ通す。重複も除去。
  const ids = Array.from(
    new Set(
      rawIds.filter((v): v is string => typeof v === 'string' && UUID_REGEX.test(v))
    )
  )

  if (ids.length === 0) {
    return NextResponse.json({ orders: [] })
  }

  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `一度に照会できる注文は ${MAX_IDS} 件までです。` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      created_at,
      estimated_ready_at,
      stores(name)
    `)
    .in('id', ids)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[orders/lookup] query error:', error)
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ orders: data ?? [] })
}
