import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'

const RANGE_DAYS: Record<string, number> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
}

// CSV エスケープ: ダブルクォートを2倍にし、必要なら全体をクォートで囲む
function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// GET /api/admin/sales/export?range=30d
// 完了した注文を CSV でダウンロード
export async function GET(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const url = new URL(request.url)
  const range = url.searchParams.get('range') ?? '30d'
  const days = RANGE_DAYS[range] ?? 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const supabase = createServiceClient()
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      order_number,
      status,
      total_amount,
      created_at,
      accepted_at,
      ready_at,
      order_items(name, qty, price)
    `)
    .eq('store_id', session.storeId)
    .in('status', ['completed'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('sales export query error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  // CSV 構築（UTF-8 BOM 付き → Excel の文字化け対策）
  const header = ['注文番号', 'ステータス', '注文日時', '受理日時', '完成日時', '合計金額', '注文内容']
  const rows = (orders ?? []).map((o) => {
    const items = (o.order_items ?? [])
      .map((i) => `${i.name} x${i.qty} (${i.price}円)`)
      .join(' / ')
    return [
      o.order_number,
      o.status,
      new Date(o.created_at).toLocaleString('ja-JP'),
      o.accepted_at ? new Date(o.accepted_at).toLocaleString('ja-JP') : '',
      o.ready_at ? new Date(o.ready_at).toLocaleString('ja-JP') : '',
      o.total_amount,
      items,
    ]
  })

  const csvLines = [
    header.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ]
  // UTF-8 BOM を先頭に付与 → Excel で文字化けしない
  const BOM = '﻿'
  const csv = BOM + csvLines.join('\r\n')

  const filename = `sales_${range}_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
