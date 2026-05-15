import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import Link from 'next/link'

export const metadata: Metadata = { title: 'レポート | mocal' }

interface Props {
  searchParams: Promise<{ date?: string; view?: string }>
}

function getWeekRange(date: string): { start: string; end: string } {
  const d = new Date(date + 'T12:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function getMonthRange(date: string): { start: string; end: string } {
  const [y, m] = date.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export default async function ReportsPage({ searchParams }: Props) {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()
  const { date: dateParam, view = 'day' } = await searchParams

  // JST の今日の日付（UTC サーバーでは toISOString が UTC 日付を返すため Intl を使用）
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  // dateParam の形式チェック（不正値はフォールバック）
  const targetDate = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !isNaN(new Date(dateParam + 'T12:00:00').getTime()))
    ? dateParam
    : today

  let rangeStart: string
  let rangeEnd: string
  let prevLink: string
  let nextLink: string
  let periodLabel: string

  if (view === 'week') {
    const { start, end } = getWeekRange(targetDate)
    rangeStart = start
    rangeEnd = end
    const prevMonday = new Date(start + 'T12:00:00')
    prevMonday.setDate(prevMonday.getDate() - 7)
    const nextMonday = new Date(start + 'T12:00:00')
    nextMonday.setDate(nextMonday.getDate() + 7)
    prevLink = `/admin/reports?view=week&date=${prevMonday.toISOString().slice(0, 10)}`
    nextLink = `/admin/reports?view=week&date=${nextMonday.toISOString().slice(0, 10)}`
    periodLabel = `${start} 〜 ${end}`
  } else if (view === 'month') {
    const { start, end } = getMonthRange(targetDate)
    rangeStart = start
    rangeEnd = end
    const [y, m] = targetDate.split('-').map(Number)
    const prevMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    prevLink = `/admin/reports?view=month&date=${prevMonth}`
    nextLink = `/admin/reports?view=month&date=${nextMonth}`
    periodLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })
  } else {
    rangeStart = targetDate
    rangeEnd = targetDate
    const prevDate = new Date(targetDate + 'T12:00:00')
    prevDate.setDate(prevDate.getDate() - 1)
    const nextDate = new Date(targetDate + 'T12:00:00')
    nextDate.setDate(nextDate.getDate() + 1)
    prevLink = `/admin/reports?view=day&date=${prevDate.toISOString().slice(0, 10)}`
    nextLink = `/admin/reports?view=day&date=${nextDate.toISOString().slice(0, 10)}`
    periodLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    })
  }

  const startTs = `${rangeStart}T00:00:00+09:00`
  const endTs = `${rangeEnd}T23:59:59+09:00`

  // 完了系注文とキャンセル系件数を並列取得
  const [{ data: orders }, { count: cancelCount }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total_amount, status, order_items(name, price, qty)')
      .eq('store_id', session.storeId)
      .in('status', ['completed', 'no_show'])
      .gte('created_at', startTs)
      .lte('created_at', endTs),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', session.storeId)
      .in('status', ['cancelled', 'refunded'])
      .gte('created_at', startTs)
      .lte('created_at', endTs),
  ])

  const completedOrders = (orders ?? []).filter(o => o.status === 'completed')
  const totalSales = completedOrders.reduce((sum, o) => sum + o.total_amount, 0)
  const orderCount = completedOrders.length
  const noShowCount = (orders ?? []).filter(o => o.status === 'no_show').length
  const avgOrder = orderCount > 0 ? Math.round(totalSales / orderCount) : 0

  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const order of completedOrders) {
    for (const item of order.order_items ?? []) {
      const existing = itemMap.get(item.name)
      if (existing) {
        existing.qty += item.qty
        existing.revenue += item.price * item.qty
      } else {
        itemMap.set(item.name, { name: item.name, qty: item.qty, revenue: item.price * item.qty })
      }
    }
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.revenue - a.revenue)

  const isLatest = view === 'day'
    ? targetDate === today
    : view === 'week'
    ? getWeekRange(today).start === rangeStart
    : getMonthRange(today).start === rangeStart

  const tabs = [
    { key: 'day', label: '日次' },
    { key: 'week', label: '週次' },
    { key: 'month', label: '月次' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
            ← 注文管理
          </Link>
          <h1 className="text-lg font-bold text-gray-900">レポート</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* タブ */}
        <nav role="tablist" aria-label="集計期間の種別" className="flex bg-white rounded-xl shadow-sm overflow-hidden">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              href={`/admin/reports?view=${tab.key}&date=${targetDate}`}
              role="tab"
              aria-selected={view === tab.key}
              className={`flex-1 text-center py-2.5 text-sm font-medium transition-colors ${
                view === tab.key
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {/* 期間ナビ */}
        <div className="flex items-center justify-between">
          <Link
            href={prevLink}
            aria-label="前の期間へ"
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
          >
            ← 前
          </Link>
          <span className="text-sm font-medium text-gray-700 text-center" aria-live="polite">{periodLabel}</span>
          {!isLatest ? (
            <Link
              href={nextLink}
              aria-label="次の期間へ"
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              次 →
            </Link>
          ) : (
            <span className="w-14" aria-hidden="true" />
          )}
        </div>

        {/* KPI カード */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500">売上</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ¥{totalSales.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500">注文数（完了）</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{orderCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500">キャンセル・返金</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{cancelCount ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500">ノーショウ</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{noShowCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 col-span-2">
            <p className="text-xs text-gray-500">平均注文単価</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {orderCount > 0 ? `¥${avgOrder.toLocaleString()}` : '—'}
            </p>
          </div>
        </div>

        {/* 商品別売上（ABC 分析） */}
        {topItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">商品別売上</h2>
            <div className="space-y-2">
              {topItems.map((item, i) => {
                const pct = totalSales > 0 ? Math.round((item.revenue / totalSales) * 100) : 0
                const rank = i < 3 ? ['A', 'B', 'C'][i] : '—'
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center ${
                      rank === 'A' ? 'text-orange-500' :
                      rank === 'B' ? 'text-blue-500' :
                      rank === 'C' ? 'text-gray-400' : 'text-gray-300'
                    }`}>{rank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="text-gray-700 truncate">{item.name}</span>
                        <span className="text-gray-900 font-medium ml-2 shrink-0">
                          ¥{item.revenue.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.name}: 売上構成比 ${pct}%`}>
                        <div
                          className="h-full bg-orange-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">
                      {item.qty}個
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {orderCount === 0 && (
          <p className="text-center text-gray-400 py-10 text-sm">この期間の完了注文はありません</p>
        )}

        {/* CSVエクスポート */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">CSV エクスポート</p>
            <p className="text-xs text-gray-400 mt-0.5">Excel で開けるファイルをダウンロード</p>
          </div>
          <a
            href={`/api/admin/reports/export?start=${rangeStart}&end=${rangeEnd}`}
            download
            className="text-sm font-medium text-orange-600 hover:text-orange-700 px-4 py-2 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
          >
            ダウンロード
          </a>
        </div>
      </main>
    </div>
  )
}
