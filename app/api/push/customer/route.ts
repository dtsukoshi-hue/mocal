import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { logger } from '@/lib/logger'

// 顧客マイページからこの端末（endpoint）が購読中の通知を一覧 / 一括解除する。
// 認可は「endpoint を知っていること」= ブラウザ自身が登録した purchaser のみ取得可能。
// endpoint は推測困難なベアラトークンとして機能する（FCM/Apple は ~150 文字以上）。

const MIN_ENDPOINT_LENGTH = 32

function isValidEndpoint(v: unknown): v is string {
  return typeof v === 'string' && v.length >= MIN_ENDPOINT_LENGTH && v.startsWith('https://')
}

// POST /api/push/customer/list（GET だと endpoint がクエリに乗って漏洩しやすいので POST 採用）
export async function POST(request: NextRequest) {
  let body: { endpoint?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }
  if (!isValidEndpoint(body.endpoint)) {
    return NextResponse.json({ error: 'エンドポイントが不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // FK の関係定義が型に登録されていないため、2 段階で取得する
  const { data: subRows, error: subErr } = await supabase
    .from('order_push_subscriptions')
    .select('order_id')
    .eq('endpoint', body.endpoint)

  if (subErr) {
    logger.error('customer push list error', { code: subErr.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  const orderIds = Array.from(new Set((subRows ?? []).map((r) => r.order_id)))
  if (orderIds.length === 0) {
    return NextResponse.json({ subscriptions: [] })
  }

  const { data: orderRows, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, status, stores(name)')
    .in('id', orderIds)

  if (orderErr) {
    logger.error('customer push order fetch error', { code: orderErr.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  type OrderRow = {
    id: string
    order_number: number
    status: string
    stores: { name: string } | null
  }
  const orderMap = new Map<string, OrderRow>(
    (orderRows as unknown as OrderRow[] | null ?? []).map((o) => [o.id, o])
  )

  const subs = orderIds.map((id) => {
    const o = orderMap.get(id)
    return {
      order_id:     id,
      order_number: o?.order_number ?? null,
      status:       o?.status ?? null,
      store_name:   o?.stores?.name ?? null,
    }
  })

  return NextResponse.json({ subscriptions: subs })
}

// DELETE: この endpoint の全購読を解除
export async function DELETE(request: NextRequest) {
  let body: { endpoint?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }
  if (!isValidEndpoint(body.endpoint)) {
    return NextResponse.json({ error: 'エンドポイントが不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('order_push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)

  if (error) {
    logger.error('customer push delete error', { code: error.code })
    return NextResponse.json({ error: '解除に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
