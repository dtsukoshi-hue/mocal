import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import AdminNav from '../_components/AdminNav'
import SalesView from './_components/SalesView'

export const metadata: Metadata = { title: 'レポート | mocal' }

interface Props {
  searchParams: Promise<{ range?: string }>
}

const RANGE_DAYS: Record<string, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export default async function ReportsPage({ searchParams }: Props) {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  const { range } = await searchParams
  const days = RANGE_DAYS[range ?? '30d'] ?? 30
  // Server Component: リクエスト開始時刻を 1 回だけ取得し、以降は純粋な計算に。
  // (react-hooks/no-impure-functions-in-render を効率的に回避するパターン)
  const now = new Date()
  // 「今日」は JST 0:00 起点に固定（過去24h ではなくカレンダー上の今日）
  const since = range === '1d'
    ? new Date(
        `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(now)}T00:00:00+09:00`,
      )
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // 完了した注文のみ集計対象（cancelled/refunded/no_show は除外）
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_amount, status, created_at, order_items(name, qty, price)')
    .eq('store_id', session.storeId)
    .in('status', ['completed'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="reports" role={session.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">レポート</h1>
        <SalesView orders={orders ?? []} currentRange={range ?? '30d'} />
      </main>
    </div>
  )
}
