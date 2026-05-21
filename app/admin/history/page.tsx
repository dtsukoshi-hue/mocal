import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import AdminNav from '../_components/AdminNav'
import HistoryFilter from './_components/HistoryFilter'
import type { OrderStatus } from '@/lib/database.aliases'

export const metadata: Metadata = { title: '注文履歴 | mocal' }

const statusLabel: Record<string, string> = {
  completed: '受取完了',
  no_show:   '未受取',
  cancelled: 'キャンセル',
  refunded:  '返金済',
}

const statusColor: Record<string, string> = {
  completed: 'bg-gray-100 text-gray-600',
  no_show:   'bg-red-100 text-red-600',
  cancelled: 'bg-amber-100 text-amber-700',
  refunded:  'bg-purple-100 text-purple-600',
}

const cancelReasonLabel: Record<string, string> = {
  store_closed:    '受付停止',
  out_of_stock:    '在庫切れ',
  store_cancel:    '店舗都合',
  user_cancel:     '客都合',
  timeout:         '未決済',
  payment_failed:  '決済失敗',
  amount_mismatch: '金額不一致',
}

type Range = '1d' | '7d' | '30d' | '90d'
const VALID_RANGES: Range[] = ['1d', '7d', '30d', '90d']

function getRangeStart(range: Range): Date {
  const now = new Date()
  const days = range === '1d' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string }>
}) {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  const params = await searchParams
  const range: Range = VALID_RANGES.includes(params.range as Range)
    ? (params.range as Range)
    : '7d'

  const allStatuses: OrderStatus[] = ['completed', 'no_show', 'cancelled', 'refunded']
  const selectedStatus: OrderStatus | null = allStatuses.includes(params.status as OrderStatus)
    ? (params.status as OrderStatus)
    : null

  const rangeStart = getRangeStart(range)

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      created_at,
      cancelled_reason_type,
      order_items(name, qty)
    `)
    .eq('store_id', session.storeId)
    .in('status', selectedStatus ? [selectedStatus] : allStatuses)
    .gte('created_at', rangeStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  // サマリー計算
  const totalSales = (orders ?? [])
    .filter((o) => o.status === 'completed')
    .reduce((s, o) => s + o.total_amount, 0)

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="history" role={session.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
          {totalSales > 0 && (
            <p className="text-sm text-gray-500">
              売上合計 <span className="font-bold text-gray-900">¥{totalSales.toLocaleString()}</span>
            </p>
          )}
        </div>

        <HistoryFilter currentRange={range} currentStatus={selectedStatus} />

        {(!orders || orders.length === 0) && (
          <div className="text-center text-gray-400 py-24 text-sm">この期間の履歴はありません</div>
        )}

        <div className="space-y-2">
          {orders?.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm tabular-nums">#{order.order_number}</span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusColor[order.status]}`}>
                    {statusLabel[order.status]}
                  </span>
                  {(order.status === 'cancelled' || order.status === 'refunded') &&
                    order.cancelled_reason_type && (
                      <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                        {cancelReasonLabel[order.cancelled_reason_type] ?? order.cancelled_reason_type}
                      </span>
                    )}
                  <time className="text-xs text-gray-400" dateTime={order.created_at}>
                    {new Date(order.created_at).toLocaleDateString('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <span className="font-semibold text-gray-900 text-sm tabular-nums shrink-0">
                  ¥{order.total_amount.toLocaleString()}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {order.order_items?.map((item, i) => (
                  <span key={i} className="text-xs text-gray-500">
                    {item.name} × {item.qty}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
