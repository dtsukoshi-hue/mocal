'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

// JST オフセット (+9h)。コンポーネント外定数なので useMemo 依存配列に
// 入れなくてよい (lint: react-hooks/exhaustive-deps を回避)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

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
  { key: '1d',  label: '今日' },
  { key: '7d',  label: '今週' },
  { key: '30d', label: '今月' },
  { key: '90d', label: '90日' },
]

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export default function SalesView({ orders, currentRange }: Props) {
  const [abcMode, setAbcMode] = useState<'revenue' | 'qty'>('revenue')

  // KPI
  const kpi = useMemo(() => {
    const total = orders.reduce((sum, o) => sum + o.total_amount, 0)
    const count = orders.length
    const avg = count > 0 ? Math.round(total / count) : 0
    return { total, count, avg }
  }, [orders])

  // 日次売上
  const dailySales = useMemo(() => {
    const map = new Map<string, { date: string; total: number; count: number }>()
    for (const o of orders) {
      // UTC → JST に変換してから日付文字列を取得
      const jstDate = new Date(new Date(o.created_at).getTime() + JST_OFFSET_MS)
      const day = jstDate.toISOString().slice(0, 10)
      const existing = map.get(day) ?? { date: day, total: 0, count: 0 }
      existing.total += o.total_amount
      existing.count += 1
      map.set(day, existing)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [orders])

  // 時間帯別注文数（0〜23時、JST）
  const hourlyCounts = useMemo(() => {
    const counts = new Array(24).fill(0)
    for (const o of orders) {
      const jstDate = new Date(new Date(o.created_at).getTime() + JST_OFFSET_MS)
      const h = jstDate.getUTCHours()
      counts[h]++
    }
    return counts
  }, [orders])
  const maxHourlyCount = Math.max(...hourlyCounts, 1)

  // メニュー別集計
  const itemStats = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const o of orders) {
      for (const item of o.order_items) {
        const existing = map.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 }
        existing.qty += item.qty
        existing.revenue += item.price * item.qty
        map.set(item.name, existing)
      }
    }
    return Array.from(map.values())
  }, [orders])

  // ABC分析（売上/販売数 切替）— 構成比累計70%が A、〜90%が B、残り C
  const abcRanking = useMemo(() => {
    const sorted = [...itemStats].sort((a, b) =>
      abcMode === 'revenue' ? b.revenue - a.revenue : b.qty - a.qty
    )
    const totalValue = sorted.reduce(
      (s, x) => s + (abcMode === 'revenue' ? x.revenue : x.qty),
      0
    )
    // 累計を再代入なしで畳み込む
    return sorted.reduce<{
      acc: number
      rows: Array<{ name: string; qty: number; revenue: number; ratio: number; cumulative: number; grade: 'A' | 'B' | 'C'; value: number }>
    }>((carry, item) => {
      const value = abcMode === 'revenue' ? item.revenue : item.qty
      const ratio = totalValue > 0 ? value / totalValue : 0
      const cumulative = carry.acc + ratio
      const grade: 'A' | 'B' | 'C' =
        cumulative <= 0.7 ? 'A' : cumulative <= 0.9 ? 'B' : 'C'
      return {
        acc: cumulative,
        rows: [...carry.rows, { ...item, ratio, cumulative, grade, value }],
      }
    }, { acc: 0, rows: [] }).rows
  }, [itemStats, abcMode])

  const top5 = useMemo(
    () => [...itemStats].sort((a, b) => b.qty - a.qty).slice(0, 5),
    [itemStats]
  )

  const maxDailyTotal = Math.max(...dailySales.map((d) => d.total), 1)

  return (
    <div className="space-y-6">
      {/* 期間切替 + CSV エクスポート */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/reports?range=${r.key}`}
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
        {(() => {
          const days = currentRange === '1d' ? 1 : currentRange === '7d' ? 7 : currentRange === '90d' ? 90 : 30
          const today = new Date()
          const start = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
          const fmt = (d: Date) =>
            new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d)
          const href = `/api/admin/reports/export?start=${fmt(start)}&end=${fmt(today)}`
          return (
            <a
              href={href}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
            >
              ⬇ CSV
            </a>
          )
        })()}
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-3 gap-3">
        <Card title="売上" value={formatYen(kpi.total)} />
        <Card title="注文数" value={`${kpi.count}件`} sub="完了済み" />
        <Card title="客単価" value={formatYen(kpi.avg)} sub="平均" />
      </div>

      {/* 日別売上 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">日別売上</h2>
        {dailySales.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">データがありません</p>
        ) : (
          <div className="space-y-1.5">
            {dailySales.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-12 shrink-0">
                  {formatDayLabel(new Date(d.date))}
                </span>
                <div className="flex-1 bg-gray-50 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-700 transition-all"
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

      {/* 時間帯別注文数 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">📊 時間帯別注文数</h2>
        <div className="grid grid-cols-12 gap-1 items-end h-32">
          {hourlyCounts.map((count, h) => (
            <div key={h} className="flex flex-col items-center justify-end gap-1 h-full">
              <div
                className="w-full bg-amber-700/80 hover:bg-amber-700 rounded-t transition-colors"
                style={{ height: `${(count / maxHourlyCount) * 100}%`, minHeight: count > 0 ? '4px' : '0' }}
                title={`${h}時: ${count}件`}
              />
              <span className="text-[9px] text-gray-400">{h}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">時（24時間制）</p>
      </section>

      {/* ABC分析 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900">📊 ABC分析</h2>
          <div className="flex gap-1">
            {(['revenue', 'qty'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setAbcMode(m)}
                className={`text-xs px-3 py-1 rounded-lg font-semibold transition-colors ${
                  abcMode === m
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m === 'revenue' ? '売上' : '販売数'}
              </button>
            ))}
          </div>
        </div>
        {abcRanking.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">データがありません</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-12 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pb-2 border-b border-gray-100">
              <span className="col-span-1">ランク</span>
              <span className="col-span-5">商品名</span>
              <span className="col-span-2 text-right">{abcMode === 'revenue' ? '売上' : '数量'}</span>
              <span className="col-span-2 text-right">構成比</span>
              <span className="col-span-2 text-right">累計</span>
            </div>
            {abcRanking.map((item) => (
              <div key={item.name} className="grid grid-cols-12 items-center py-1.5 text-sm">
                <span className={`col-span-1 inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                  item.grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                  item.grade === 'B' ? 'bg-amber-100 text-amber-700' :
                                       'bg-gray-100 text-gray-600'
                }`}>{item.grade}</span>
                <span className="col-span-5 text-gray-900 truncate">{item.name}</span>
                <span className="col-span-2 text-right text-gray-700 tabular-nums text-xs">
                  {abcMode === 'revenue' ? formatYen(item.value) : `${item.value}個`}
                </span>
                <span className="col-span-2 text-right text-gray-500 tabular-nums text-xs">
                  {(item.ratio * 100).toFixed(1)}%
                </span>
                <span className="col-span-2 text-right text-gray-400 tabular-nums text-xs">
                  {(item.cumulative * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 人気メニュー TOP5 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-4">🏆 人気メニュー TOP5</h2>
        {top5.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">データがありません</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {top5.map((item, i) => (
              <li key={item.name} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-bold w-6 text-center shrink-0 ${
                    i === 0 ? 'text-amber-500' :
                    i === 1 ? 'text-gray-400' :
                    i === 2 ? 'text-amber-700' :
                              'text-gray-300'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-gray-900 truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-gray-400">{item.qty}件</span>
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

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
