'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OrderItem = { name: string; qty: number; price: number }

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  estimated_ready_at: string | null
  order_items: OrderItem[]
}

const statusLabel: Record<string, string> = {
  paid:      '新規注文',
  accepted:  '受理済',
  preparing: '調理中',
  ready:     '受取可能',
}

const statusColor: Record<string, string> = {
  paid:      'bg-yellow-100 text-yellow-800',
  accepted:  'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready:     'bg-green-100 text-green-800',
}

const nextActions: Record<string, { label: string; status: string; color: string }[]> = {
  paid:      [{ label: '受理する', status: 'accepted', color: 'bg-blue-500 hover:bg-blue-600' }],
  accepted:  [{ label: '調理開始', status: 'preparing', color: 'bg-purple-500 hover:bg-purple-600' }],
  preparing: [{ label: 'できあがり', status: 'ready', color: 'bg-green-500 hover:bg-green-600' }],
  ready:     [
    { label: '受取完了', status: 'completed', color: 'bg-gray-500 hover:bg-gray-600' },
    { label: '未受取', status: 'no_show', color: 'bg-red-400 hover:bg-red-500' },
  ],
}

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

export default function OrderCard({ order }: { order: Order }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [waitMinutes, setWaitMinutes] = useState(15)

  async function handleAction(status: string) {
    setLoading(true)
    await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(status === 'accepted' ? { waitMinutes } : {}),
      }),
    })
    router.refresh()
    setLoading(false)
  }

  const actions = nextActions[order.status] ?? []

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">
            #{order.order_number}
          </span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[order.status]}`}>
            {statusLabel[order.status]}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-900">
          ¥{order.total_amount.toLocaleString()}
        </span>
      </div>

      <ul className="text-sm text-gray-600 space-y-0.5">
        {order.order_items?.map((item, i) => (
          <li key={i}>{item.name} × {item.qty}</li>
        ))}
      </ul>

      {order.estimated_ready_at && (
        <p className="text-xs text-gray-400">
          受取予定：{new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {order.status === 'paid' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>受取まで</span>
          <select
            value={waitMinutes}
            onChange={e => setWaitMinutes(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {WAIT_OPTIONS.map(m => (
              <option key={m} value={m}>{m}分</option>
            ))}
          </select>
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex gap-2 pt-1">
          {actions.map(action => (
            <button
              key={action.status}
              disabled={loading}
              onClick={() => handleAction(action.status)}
              className={`flex-1 rounded-lg text-white text-sm font-semibold py-2 transition-colors disabled:opacity-50 ${action.color}`}
            >
              {loading ? '処理中...' : action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
