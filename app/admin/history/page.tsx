import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import Link from 'next/link'

export const metadata: Metadata = { title: '注文履歴 | mocal' }

const PAGE_SIZE = 20

const ALL_STATUSES = ['completed', 'cancelled', 'refunded', 'no_show'] as const
type HistoryStatus = typeof ALL_STATUSES[number]

const statusLabel: Record<HistoryStatus, string> = {
  completed: '受取完了',
  cancelled: 'キャンセル',
  refunded:  '返金済',
  no_show:   'ノーショウ',
}

const statusColor: Record<HistoryStatus, string> = {
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
  refunded:  'bg-orange-100 text-orange-600',
  no_show:   'bg-yellow-100 text-yellow-700',
}

const cancelledReasonLabel: Record<string, string> = {
  store_closed:     '営業時間外',
  out_of_stock:     '在庫切れ',
  store_cancel:     '店舗キャンセル',
  user_cancel:      'ユーザーキャンセル',
  timeout:          'タイムアウト',
  payment_failed:   '決済失敗',
  amount_mismatch:  '金額不一致',
}

interface Props {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}

export default async function HistoryPage({ searchParams }: Props) {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()
  const { page: pageStr, status: statusParam, q } = await searchParams

  // 注文番号検索
  const searchNum = q ? parseInt(q, 10) : NaN
  const isSearching = !isNaN(searchNum) && searchNum > 0

  const page = Math.max(1, parseInt(pageStr ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const activeStatus = ALL_STATUSES.includes(statusParam as HistoryStatus)
    ? (statusParam as HistoryStatus)
    : null

  // 検索中はステータスフィルターを無視してすべてのステータスで検索
  const statusFilter = isSearching
    ? [...ALL_STATUSES]
    : (activeStatus ? [activeStatus] : [...ALL_STATUSES])

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      pickup_type,
      scheduled_at,
      customer_note,
      created_at,
      cancelled_reason_type,
      order_items(name, qty)
    `, { count: 'exact' })
    .eq('store_id', session.storeId)
    .in('status', statusFilter)
    .order('created_at', { ascending: false })

  if (isSearching) {
    query = query.eq('order_number', searchNum)
  } else {
    query = query.range(from, to)
  }

  const { data: orders, count } = await query

  const totalPages = isSearching ? 1 : Math.ceil((count ?? 0) / PAGE_SIZE)

  function pageLink(p: number) {
    const params = new URLSearchParams()
    if (p > 1) params.set('page', String(p))
    if (activeStatus) params.set('status', activeStatus)
    const qs = params.toString()
    return `/admin/history${qs ? `?${qs}` : ''}`
  }

  function statusLink(s: HistoryStatus | null) {
    if (!s) return '/admin/history'
    return `/admin/history?status=${s}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
            <span aria-hidden="true">← </span>注文管理
          </Link>
          <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {/* 注文番号検索 */}
        <form method="GET" action="/admin/history" role="search" className="flex gap-2">
          <input
            type="number"
            name="q"
            min={1}
            defaultValue={isSearching ? searchNum : ''}
            placeholder="注文番号で検索（例: 42）"
            aria-label="注文番号で検索"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            検索
          </button>
          {isSearching && (
            <Link
              href="/admin/history"
              className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              クリア
            </Link>
          )}
        </form>

        {/* ステータスフィルター（検索中は非表示） */}
        {!isSearching && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={statusLink(null)}
              aria-current={!activeStatus ? 'page' : undefined}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                !activeStatus
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              すべて
            </Link>
            {ALL_STATUSES.map(s => (
              <Link
                key={s}
                href={statusLink(s)}
                aria-current={activeStatus === s ? 'page' : undefined}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  activeStatus === s
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {statusLabel[s]}
              </Link>
            ))}
          </div>
        )}

        {isSearching && (
          <p className="text-xs text-gray-500">
            注文 #{searchNum} の検索結果
          </p>
        )}

        {(!orders || orders.length === 0) && (
          <p className="text-center text-gray-400 py-16 text-sm">
            {isSearching ? `注文 #${searchNum} は履歴に見つかりませんでした` : '履歴はありません'}
          </p>
        )}

        {orders?.map(order => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">#{order.order_number}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[order.status as HistoryStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                  {statusLabel[order.status as HistoryStatus] ?? order.status}
                </span>
                {order.cancelled_reason_type && (
                  <span className="text-xs text-gray-400">
                    ({cancelledReasonLabel[order.cancelled_reason_type] ?? order.cancelled_reason_type})
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                ¥{order.total_amount.toLocaleString()}
              </span>
            </div>

            <ul className="text-xs text-gray-500 space-y-0.5">
              {order.order_items?.map((item, i) => (
                <li key={i}>{item.name} × {item.qty}</li>
              ))}
            </ul>

            {order.customer_note && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                <span aria-hidden="true">📝</span> {order.customer_note}
              </p>
            )}

            {order.pickup_type === 'scheduled' && order.scheduled_at && (
              <p className="text-xs text-indigo-600">
                <span aria-hidden="true">🕐</span> 指定受取：<time dateTime={order.scheduled_at}>{new Date(order.scheduled_at).toLocaleTimeString('ja-JP', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
                })}</time>
              </p>
            )}

            <time className="text-xs text-gray-400" dateTime={order.created_at}>
              {new Date(order.created_at).toLocaleString('ja-JP', {
                month: 'numeric', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
                timeZone: 'Asia/Tokyo',
              })}
            </time>
          </div>
        ))}

        {totalPages > 1 && (
          <nav aria-label="ページ切り替え" className="flex justify-center gap-2 pt-4">
            {page > 1 && (
              <Link
                href={pageLink(page - 1)}
                aria-label="前のページへ"
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                前へ
              </Link>
            )}
            <span className="px-4 py-2 text-sm text-gray-500" aria-current="page">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={pageLink(page + 1)}
                aria-label="次のページへ"
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                次へ
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  )
}
