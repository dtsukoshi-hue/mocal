'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type OrderStatus = 'paid' | 'accepted' | 'preparing' | 'ready'
const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60] as const

interface Props {
  orderId: string
  status: OrderStatus
  defaultWaitMinutes?: number
}

export default function OrderActions({ orderId, status, defaultWaitMinutes = 20 }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isFetching, setIsFetching] = useState(false)
  const [waitMinutes, setWaitMinutes] = useState<number>(defaultWaitMinutes)
  const [error, setError] = useState<string | null>(null)

  function confirmCancel(): boolean {
    return confirm('この注文をキャンセルしますか？\n決済済みの場合は自動返金されます。')
  }

  async function patch(body: { status: string; waitMinutes?: number }) {
    setError(null)
    setIsFetching(true)
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? '更新に失敗しました。')
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setIsFetching(false)
    }
  }

  // fetch 中も router.refresh() 中もボタンを無効化
  const disabled = isFetching || isPending

  return (
    <div className="space-y-2 pt-1">
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      {status === 'paid' && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={waitMinutes}
            onChange={e => setWaitMinutes(Number(e.target.value))}
            disabled={disabled}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            {WAIT_OPTIONS.map(m => (
              <option key={m} value={m}>{m}分</option>
            ))}
          </select>
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'accepted', waitMinutes })}
            className="flex-1 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            {disabled ? '処理中…' : '受理する'}
          </button>
          <button
            disabled={disabled}
            onClick={() => confirmCancel() && patch({ status: 'cancelled' })}
            className="text-sm font-medium bg-white hover:bg-gray-50 text-red-600 border border-red-200 rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      )}

      {status === 'accepted' && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'preparing' })}
            className="text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            {disabled ? '処理中…' : '調理開始'}
          </button>
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'ready' })}
            className="text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            準備完了
          </button>
          <button
            disabled={disabled}
            onClick={() => confirmCancel() && patch({ status: 'cancelled' })}
            className="text-sm font-medium bg-white hover:bg-gray-50 text-red-600 border border-red-200 rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      )}

      {status === 'preparing' && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'ready' })}
            className="flex-1 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            {disabled ? '処理中…' : '準備完了'}
          </button>
          <button
            disabled={disabled}
            onClick={() => confirmCancel() && patch({ status: 'cancelled' })}
            className="text-sm font-medium bg-white hover:bg-gray-50 text-red-600 border border-red-200 rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      )}

      {status === 'ready' && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'completed' })}
            className="flex-1 text-sm font-medium bg-gray-800 hover:bg-gray-900 text-white rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            {disabled ? '処理中…' : '受取確認'}
          </button>
          <button
            disabled={disabled}
            onClick={() => patch({ status: 'no_show' })}
            className="text-sm font-medium bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-lg px-4 py-1.5 disabled:opacity-50"
          >
            ノーショウ
          </button>
        </div>
      )}
    </div>
  )
}
