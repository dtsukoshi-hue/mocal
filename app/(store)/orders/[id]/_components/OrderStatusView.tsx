'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, OrderStatus } from '@/lib/database.types'
import { saveOrderToHistory } from '@/lib/order-history'

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  estimated_ready_at: string | null
  store_id: string
  stores: { name: string } | null
  order_items: { name: string; qty: number; price: number }[]
}

interface Props {
  order: Order
}

// Progress steps for normal flow
const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'paid',      label: '注文受付' },
  { key: 'accepted',  label: '受理' },
  { key: 'preparing', label: '調理中' },
  { key: 'ready',     label: 'できあがり' },
  { key: 'completed', label: '受取完了' },
]

const NORMAL_STATUSES = new Set<string>(['paid', 'accepted', 'preparing', 'ready', 'completed'])

const STATUS_CONFIG: Record<string, { label: string; icon: string; description: string; color: string }> = {
  pending:   { label: '決済処理中',   icon: '⏳', description: '決済を確認しています...',                     color: 'text-gray-500' },
  paid:      { label: '注文受付済',   icon: '✅', description: '店舗の受理をお待ちください',                  color: 'text-blue-600' },
  accepted:  { label: '受理済',       icon: '👨‍🍳', description: '調理を開始します',                          color: 'text-purple-600' },
  preparing: { label: '調理中',       icon: '🍳', description: '準備中です。もうしばらくお待ちください',     color: 'text-orange-600' },
  ready:     { label: 'できあがり！', icon: '🎉', description: 'カウンターへお越しください',                  color: 'text-emerald-600' },
  completed: { label: '受取完了',     icon: '😊', description: 'ご利用ありがとうございました',                color: 'text-gray-600' },
  cancelled: { label: 'キャンセル',   icon: '❌', description: '注文はキャンセルされました',                  color: 'text-red-500' },
  refunded:  { label: '返金済',       icon: '💴', description: '返金処理が完了しました',                      color: 'text-purple-500' },
  no_show:   { label: '未受取',       icon: '⏰', description: '受取時間が過ぎました',                        color: 'text-red-400' },
}

function getStepIndex(status: string): number {
  return STEPS.findIndex(s => s.key === status)
}

export default function OrderStatusView({ order: initialOrder }: Props) {
  const [order, setOrder] = useState(initialOrder)

  // ブラウザの履歴に保存（再訪問時に /orders ページから一覧で見られるようにする）
  useEffect(() => {
    saveOrderToHistory(order.id)
  }, [order.id])

  useEffect(() => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel(`order-${order.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${order.id}`,
        },
        (payload) => {
          setOrder(prev => ({ ...prev, ...payload.new }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [order.id])

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
  const isNormalFlow = NORMAL_STATUSES.has(order.status)
  const currentStepIndex = getStepIndex(order.status)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-0.5 truncate">{order.stores?.name}</p>
            <h1 className="text-lg font-bold text-gray-900">注文 #{order.order_number}</h1>
          </div>
          <Link
            href="/orders"
            className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            注文履歴
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 flex-1 w-full space-y-4">

        {/* ステータスカード */}
        <div className={`bg-white rounded-2xl shadow-sm p-6 text-center ${
          order.status === 'ready' ? 'ring-2 ring-emerald-400' : ''
        }`}>
          <div className="text-5xl mb-3">{config.icon}</div>
          <h2 className={`text-xl font-bold mb-1 ${config.color}`}>{config.label}</h2>
          <p className="text-sm text-gray-500">{config.description}</p>

          {order.estimated_ready_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
            <div className="mt-4 inline-block bg-orange-50 text-orange-700 text-sm font-semibold px-4 py-2 rounded-full">
              受取予定 {new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}

          {order.status === 'pending' && (
            <p className="mt-3 text-xs text-gray-400">このページは自動で更新されます</p>
          )}
        </div>

        {/* プログレスステッパー（通常フローのみ） */}
        {isNormalFlow && (
          <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
            <div className="flex items-center justify-between">
              {STEPS.map((step, i) => {
                const done = i < currentStepIndex
                const active = i === currentStepIndex
                const last = i === STEPS.length - 1

                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        done    ? 'bg-emerald-500 text-white' :
                        active  ? 'bg-blue-500 text-white ring-4 ring-blue-100' :
                                  'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] text-center leading-tight ${
                        active ? 'text-blue-600 font-semibold' :
                        done   ? 'text-emerald-600' :
                                 'text-gray-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {!last && (
                      <div className={`flex-1 h-0.5 mb-4 mx-1 ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 注文内容 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">注文内容</h3>
          <ul className="divide-y divide-gray-50 text-sm">
            {order.order_items.map((item, i) => (
              <li key={i} className="flex justify-between py-2 text-gray-700">
                <span>
                  {item.name}
                  <span className="text-gray-400 ml-1">× {item.qty}</span>
                </span>
                <span className="text-gray-600">¥{(item.price * item.qty).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>合計</span>
            <span>¥{order.total_amount.toLocaleString()}</span>
          </div>
        </div>

      </main>
    </div>
  )
}
