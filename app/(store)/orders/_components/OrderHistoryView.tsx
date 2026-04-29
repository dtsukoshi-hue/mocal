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

const ACTIVE_STATUSES = new Set(['pending', 'paid', 'accepted', 'preparing', 'ready'])

export default function OrderHistoryView() {
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
      <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
        {error}
      </div>
    )
  }

  if (orders === null) {
    return <div className="text-center text-gray-400 py-16 text-sm">読み込み中...</div>
  }

  if (isEmpty) {
    return (
      <div className="text-center text-gray-400 py-16 text-sm">
        このブラウザに保存された注文はありません。
      </div>
    )
  }

  const active = orders.filter(o => ACTIVE_STATUSES.has(o.status))
  const past = orders.filter(o => !ACTIVE_STATUSES.has(o.status))

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 px-1">対応中</h2>
          {active.map(order => <OrderRow key={order.id} order={order} />)}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 px-1">過去の注文</h2>
          {past.map(order => <OrderRow key={order.id} order={order} />)}
        </section>
      )}
    </div>
  )
}

function OrderRow({ order }: { order: FetchedOrder }) {
  return (
    <Link
      href={`/orders/${order.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-gray-900 text-sm shrink-0">
            #{order.order_number}
          </span>
          <span className="text-xs text-gray-500 truncate">
            {order.stores?.name ?? ''}
          </span>
        </div>
        <span className="text-xs font-semibold text-gray-700 shrink-0">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(order.created_at).toLocaleDateString('ja-JP', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
        <span className="text-sm font-semibold text-gray-900">
          ¥{order.total_amount.toLocaleString()}
        </span>
      </div>
    </Link>
  )
}
