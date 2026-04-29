'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type OrderItem = { name: string; qty: number; price: number }

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  estimated_ready_at: string | null
  accepted_at: string | null
  created_at: string
  customer_note: string | null
  order_items: OrderItem[]
}

const statusLabel: Record<string, string> = {
  paid:      '新規注文',
  accepted:  '受理済',
  preparing: '調理中',
  ready:     '受取可能',
}

const statusColor: Record<string, string> = {
  paid:      'bg-amber-100 text-amber-800',
  accepted:  'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  ready:     'bg-emerald-100 text-emerald-800',
}

const nextActions: Record<string, { label: string; status: string; color: string }[]> = {
  paid:      [{ label: '受理する', status: 'accepted', color: 'bg-blue-500 hover:bg-blue-600' }],
  accepted:  [{ label: '調理開始', status: 'preparing', color: 'bg-purple-500 hover:bg-purple-600' }],
  preparing: [{ label: 'できあがり', status: 'ready', color: 'bg-emerald-500 hover:bg-emerald-600' }],
  ready:     [
    { label: '受取完了', status: 'completed', color: 'bg-gray-500 hover:bg-gray-600' },
    { label: '未受取', status: 'no_show', color: 'bg-red-400 hover:bg-red-500' },
  ],
}

const cancelableStatuses = ['paid', 'accepted', 'preparing']

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

export default function OrderCard({ order }: { order: Order }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitMinutes, setWaitMinutes] = useState(15)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const isDisabled = loading || isPending

  async function handleAction(status: string) {
    setLoading(true)
    setError(null)
    setConfirmCancel(false)
    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(status === 'accepted' ? { waitMinutes } : {}),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '更新に失敗しました')
      setLoading(false)
      return
    }
    startTransition(() => { router.refresh() })
    setLoading(false)
  }

  const actions = nextActions[order.status] ?? []
  const canCancel = cancelableStatuses.includes(order.status)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* ヘッダー */}
      <div className={`px-5 py-3 flex items-center justify-between ${
        order.status === 'paid' ? 'bg-amber-50' :
        order.status === 'ready' ? 'bg-emerald-50' : 'bg-gray-50'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-gray-900">
            #{order.order_number}
          </span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[order.status]}`}>
            {statusLabel[order.status]}
          </span>
        </div>
        <span className="text-base font-bold text-gray-900">
          ¥{order.total_amount.toLocaleString()}
        </span>
      </div>

      {/* 本文 */}
      <div className="px-5 py-4 space-y-3">
        <ul className="text-sm text-gray-700 space-y-1">
          {order.order_items?.map((item, i) => (
            <li key={i} className="flex justify-between">
              <span>{item.name} <span className="text-gray-400">× {item.qty}</span></span>
              <span className="text-gray-500">¥{(item.price * item.qty).toLocaleString()}</span>
            </li>
          ))}
        </ul>

        {order.estimated_ready_at && (
          <p className="text-xs text-gray-400">
            受取予定：{new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        {order.customer_note && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-amber-700 mb-0.5">📝 ご要望</p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
              {order.customer_note}
            </p>
          </div>
        )}

        {order.status === 'paid' && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>受取まで</span>
            <select
              value={waitMinutes}
              onChange={e => setWaitMinutes(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white"
            >
              {WAIT_OPTIONS.map(m => (
                <option key={m} value={m}>{m}分</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* キャンセル確認 */}
        {confirmCancel && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-red-800">この注文をキャンセルしますか？</p>
            <p className="text-xs text-red-600">決済済みの場合は自動で返金されます。</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmCancel(false)}
                disabled={isDisabled}
                className="flex-1 rounded-lg border border-gray-300 text-gray-600 text-sm py-1.5 hover:bg-gray-50"
              >
                戻る
              </button>
              <button
                onClick={() => handleAction('cancelled')}
                disabled={isDisabled}
                className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-1.5 disabled:opacity-50"
              >
                {isDisabled ? '処理中...' : 'キャンセル確定'}
              </button>
            </div>
          </div>
        )}

        {/* アクションボタン */}
        {!confirmCancel && (
          <div className="flex gap-2 pt-1">
            {actions.map(action => (
              <button
                key={action.status}
                disabled={isDisabled}
                onClick={() => handleAction(action.status)}
                className={`flex-1 rounded-xl text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-50 ${action.color}`}
              >
                {isDisabled ? '処理中...' : action.label}
              </button>
            ))}
            {canCancel && (
              <button
                disabled={isDisabled}
                onClick={() => setConfirmCancel(true)}
                className="px-4 rounded-xl border border-red-200 text-red-500 text-sm font-medium py-2.5 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
