import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'

// GET /api/admin/reports/export?start=YYYY-MM-DD&end=YYYY-MM-DD
// 認証: lib/dal.ts の verifyStoreSession (Supabase Auth) で店舗メンバー検証
export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof verifyStoreSession>>
  try {
    session = await verifyStoreSession()
  } catch {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: '期間を正しく指定してください (YYYY-MM-DD)。' }, { status: 400 })
  }

  const startTs = `${start}T00:00:00+09:00`
  const endTs = `${end}T23:59:59+09:00`

  const supabase = createServiceClient()
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      order_number,
      status,
      total_amount,
      pickup_type,
      scheduled_at,
      created_at,
      accepted_at,
      ready_at,
      cancelled_reason_type,
      order_items(name, price, qty)
    `)
    .eq('store_id', session.storeId)
    .in('status', ['completed', 'cancelled', 'refunded', 'no_show'])
    .gte('created_at', startTs)
    .lte('created_at', endTs)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[reports/export] 取得失敗:', error)
    return NextResponse.json({ error: 'データの取得に失敗しました。' }, { status: 500 })
  }

  const statusLabel: Record<string, string> = {
    completed: '受取完了',
    cancelled: 'キャンセル',
    refunded:  '返金済',
    no_show:   'ノーショウ',
  }

  const rows: string[] = [
    '注文番号,ステータス,合計金額,受取方法,注文日時,受理日時,準備完了日時,キャンセル理由,商品明細',
  ]

  /**
   * CSV インジェクション対策 (F-07):
   * Excel / LibreOffice は `=`, `+`, `-`, `@`, `\t`, `\r` で始まるセルを
   * 数式として実行する。メニュー名等のユーザー入力にこれらが含まれると
   * 危険なため、先頭に single quote を付ける。
   * 加えて " は "" にエスケープし、全体を " で囲む（標準 CSV）。
   */
  function escapeCsvCell(v: unknown): string {
    let s = String(v)
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s
    }
    return '"' + s.replace(/"/g, '""') + '"'
  }

  for (const order of orders ?? []) {
    const items = (order.order_items ?? [])
      .map((i: { name: string; price: number; qty: number }) => `${i.name}×${i.qty}(¥${i.price * i.qty})`)
      .join(' / ')
    const pickupLabel = order.pickup_type === 'scheduled' ? '時間指定' : '標準'
    const toJST = (iso: string) =>
      new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

    const row = [
      order.order_number,
      statusLabel[order.status] ?? order.status,
      order.total_amount,
      pickupLabel,
      order.created_at  ? toJST(order.created_at)  : '',
      order.accepted_at ? toJST(order.accepted_at)  : '',
      order.ready_at    ? toJST(order.ready_at)     : '',
      order.cancelled_reason_type ?? '',
      items,
    ]
      .map(escapeCsvCell)
      .join(',')
    rows.push(row)
  }

  const csv = '﻿' + rows.join('\r\n') // BOM付きUTF-8（Excel対応）
  const filename = `mocal_orders_${start}_${end}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
