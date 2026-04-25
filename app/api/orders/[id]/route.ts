import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import type { OrderStatus } from '@/lib/database.types'

// 店舗が注文ステータスを更新するエンドポイント
// PATCH /api/orders/:id  { status: OrderStatus }
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/orders/[id]'>
) {
  const { id } = await ctx.params

  // カスタムセッションで店舗認証（Supabase Auth は使用しない）
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  // UUID 形式チェック（不正なパスパラメータによるクエリを防ぐ）
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  let body: { status: OrderStatus; waitMinutes?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { status, waitMinutes } = body

  // status の入力バリデーション
  const validStatuses: OrderStatus[] = [
    'pending', 'paid', 'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'refunded', 'no_show',
  ]
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'ステータス値が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 注文の所属店舗確認
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, store_id')
    .eq('id', id)
    .single()

  if (!order) {
    return NextResponse.json({ error: '注文が見つかりません。' }, { status: 404 })
  }

  // セッションの storeId と注文の store_id を照合（権限確認）
  if (session.storeId !== order.store_id) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  // ステータス遷移検証（仕様書 6.4 に基づく）
  const validTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    paid:      ['accepted', 'cancelled'],
    accepted:  ['preparing', 'ready', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready:     ['completed', 'no_show'],
  }

  const allowed = validTransitions[order.status as OrderStatus] ?? []
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: 'このステータスへの変更は現在許可されていません。' },
      { status: 422 }
    )
  }

  const now = new Date().toISOString()
  // Partial<OrderInsert> に変換して型安全に更新
  const updateData: {
    status: OrderStatus
    accepted_at?: string
    estimated_ready_at?: string
    ready_at?: string
    no_show_at?: string
  } = { status }

  if (status === 'accepted') {
    updateData.accepted_at = now
    if (waitMinutes) {
      const estimatedReadyAt = new Date(Date.now() + waitMinutes * 60 * 1000)
      updateData.estimated_ready_at = estimatedReadyAt.toISOString()
    }
  }
  if (status === 'ready') updateData.ready_at = now
  if (status === 'no_show') updateData.no_show_at = now

  const { data: updated, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ order: updated })
}
