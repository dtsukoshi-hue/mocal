'use client'

import { useMemo } from 'react'
import Link from 'next/link'

type OrderItem = { name: string; qty: number; price: number }
type Order = {
  id: string
  total_amount: number
  status: string
  created_at: string
  order_items: OrderItem[]
}

interface Props {
  orders: Order[]
  currentRange: string
}

const RANGES = [
  { key: '7d',  label: '7日' },
  { key: '30d', label: '30日' },
  { key: '90d', label: '90日' },
]

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export default function SalesView({ orders, currentRange }: Props) {
  // KPI: 総売上・注文数・平均単価
  const kpi = useMemo(() => {
    const total = orders.reduce((sum, o) => sum + o.total_amount, 0)
    const count = orders.length
    const avg = count > 0 ? Math.round(total / count) : 0
    return { total, count, avg }
  }, [orders])

  // 日次売上（YYYY-MM-DD ごと）
  const dailySales = useMemo(() => {
    const map = new Map<string, { date: string; total: number; count: number }>()
    for (const o of orders) {
      const day = o.created_at.slice(0, 10) // YYYY-MM-DD
      const existing = map.get(day) ?? { date: day, total: 0, count: 0 }
      existing.total += o.total_amount
      existing.count += 1
      map.set(day, existing)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [orders])

  // メニュー別集計
  const itemRanking = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const o of orders) {
      for (const item of o.order_items) {
        const existing = map.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 }
        existing.qty += item.qty
        existing.revenue += item.price * item.qty
        map.set(item.name, existing)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  const maxDailyTotal = Math.max(...dailySales.map((d) => d.total), 1)

  return (
    <div className="space-y-6">
      {/* 期間切替 + CSV エクスポート */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/sales?range=${r.key}`}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                currentRange === r.key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <a
          href={`/api/admin/sales/export?range=${currentRange}`}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
        >
          ⬇ CSV
        </a>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-3 gap-3">
        <Card title="売上合計" value={formatYen(kpi.total)} />
        <Card title="注文数" value={`${kpi.count}件`} />
        <Card title="平均単価" value={formatYen(kpi.avg)} />
      </div>

      {/* 日次売上グラフ */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">日別売上</h2>
        {dailySales.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            データがありません
          </p>
        ) : (
          <div className="space-y-1.5">
            {dailySales.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-12 shrink-0">
                  {formatDayLabel(new Date(d.date))}
                </span>
                <div className="flex-1 bg-gray-50 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                    style={{ width: `${(d.total / maxDailyTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-700 font-semibold w-20 text-right shrink-0">
                  {formatYen(d.total)}
                </span>
                <span className="text-xs text-gray-400 w-10 text-right shrink-0">
                  {d.count}件
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* メニュー別売上ランキング */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">人気メニュー</h2>
        {itemRanking.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            データがありません
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itemRanking.map((item, i) => (
              <li key={item.name} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-bold w-6 text-center shrink-0 ${
                    i === 0 ? 'text-amber-500' :
                    i === 1 ? 'text-gray-400' :
                    i === 2 ? 'text-orange-700' :
                              'text-gray-300'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-900 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-gray-400">{item.qty}個</span>
                  <span className="text-sm font-semibold text-gray-900 w-20 text-right">
                    {formatYen(item.revenue)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
