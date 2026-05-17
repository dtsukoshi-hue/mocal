'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getOrderHistory, removeOrderFromHistory } from '@/lib/order-history'

type StoreInfo = { name: string } | null

interface FetchedOrder {
  id: string
  order_number: number
  status: string
  total_amount: number
  created_at: string
  estimated_ready_at: string | null
  stores: StoreInfo
}

const STATUS_LABEL: Record<string, string> = {
  pending:   '決済処理中',
  paid:      '注文受付済',
  accepted:  '受付済',
  preparing: '調理中',
  ready:     '受取可能',
  completed: '受取完了',
  cancelled: 'キャンセル',
  refunded:  '返金済',
  no_show:   '未受取',
}

// ステータス別バッジスタイル
const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-gray-100  text-gray-600',
  paid:      'bg-blue-50   text-blue-700   border border-blue-200',
  accepted:  'bg-purple-50 text-purple-700 border border-purple-200',
  preparing: 'bg-amber-50  text-amber-700  border border-amber-200',
  ready:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  completed: 'bg-gray-50   text-gray-500',
  cancelled: 'bg-red-50    text-red-600',
  refunded:  'bg-purple-50 text-purple-600',
  no_show:   'bg-red-50    text-red-400',
}

const ACTIVE_STATUSES = new Set(['pending', 'paid', 'accepted', 'preparing', 'ready'])

export default function OrderHistoryList() {
  const [orders, setOrders] = useState<FetchedOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const local = getOrderHistory()
      if (local.length === 0) {
        if (!cancelled) {
          setIsEmpty(true)
          setOrders([])
        }
        return
      }

      try {
        const res = await fetch('/api/orders/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: local.map(e => e.id) }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (!cancelled) setError(data.error ?? '注文の取得に失敗しました')
          return
        }

        const data = (await res.json()) as { orders: FetchedOrder[] }
        if (cancelled) return

        // サーバーで見つからなかった ID は localStorage から除去
        const foundIds = new Set(data.orders.map(o => o.id))
        for (const e of local) {
          if (!foundIds.has(e.id)) removeOrderFromHistory(e.id)
        }

        setOrders(data.orders)
        setIsEmpty(data.orders.length === 0)
      } catch {
        if (!cancelled) setError('ネットワークエラーが発生しました')
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div role="alert" className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (orders === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 animate-pulse">
            <div className="flex items-center justify-between mb-2">
              <div className="h-4 w-20 bg-gray-100 rounded" />
              <div className="h-4 w-14 bg-gray-100 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="h-4 w-12 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="text-center text-gray-400 py-20 text-sm">
        <p className="text-3xl mb-3">📋</p>
        <p>このブラウザに保存された注文はありません</p>
      </div>
    )
  }

  const active = orders.filter(o => ACTIVE_STATUSES.has(o.status))
  const past = orders.filter(o => !ACTIVE_STATUSES.has(o.status))

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">対応中</h2>
          {active.map(order => <OrderRow key={order.id} order={order} />)}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">過去の注文</h2>
          {past.map(order => <OrderRow key={order.id} order={order} />)}
        </section>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: FetchedOrder }) {
  const badgeClass = STATUS_BADGE[order.status] ?? 'bg-gray-100 text-gray-600'

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 hover:bg-amber-50/40 hover:border-amber-200/60 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-gray-900 tabular-nums shrink-0">
            #{order.order_number}
          </span>
          <span className="text-xs text-gray-400 truncate">
            {order.stores?.name ?? ''}
          </span>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${badgeClass}`}>
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(order.created_at).toLocaleDateString('ja-JP', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          ¥{order.total_amount.toLocaleString()}
        </span>
      </div>
    </Link>
  )
}
