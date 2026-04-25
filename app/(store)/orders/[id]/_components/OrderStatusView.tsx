'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, OrderStatus } from '@/lib/database.types'

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

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: string; description: string }> = {
  pending:   { label: '決済処理中',   icon: '⏳', description: '決済を確認しています...' },
  paid:      { label: '注文受付済',   icon: '✅', description: '店舗の受理をお待ちください' },
  accepted:  { label: '受理済',       icon: '👨‍🍳', description: '調理を開始します' },
  preparing: { label: '調理中',       icon: '🍳', description: '準備中です。もうしばらくお待ちください' },
  ready:     { label: '受取可能',     icon: '🎉', description: 'できあがりました！カウンターへお越しください' },
  completed: { label: '受取完了',     icon: '😊', description: 'ご利用ありがとうございました' },
  cancelled: { label: 'キャンセル',   icon: '❌', description: '注文はキャンセルされました' },
  refunded:  { label: '返金済',       icon: '💴', description: '返金処理が完了しました' },
  no_show:   { label: '未受取',       icon: '⏰', description: '受取時間が過ぎました' },
}

export default function OrderStatusView({ order: initialOrder }: Props) {
  const [order, setOrder] = useState(initialOrder)

  // Supabase Realtime でステータスをリアルタイム更新
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

  const config = STATUS_CONFIG[order.status as OrderStatus] ?? STATUS_CONFIG.pending

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 py-4">
          <p className="text-sm text-gray-500">{order.stores?.name}</p>
          <h1 className="text-lg font-bold text-gray-900">
            注文 #{order.order_number}
          </h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 flex-1 space-y-6">
        {/* ステータス表示 */}
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="text-5xl mb-4">{config.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{config.label}</h2>
          <p className="text-sm text-gray-500">{config.description}</p>

          {order.estimated_ready_at && order.status === 'accepted' && (
            <p className="mt-4 text-sm font-semibold text-orange-600">
              受取予定：{new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}

          {/* pending の時はポーリングを案内 */}
          {order.status === 'pending' && (
            <p className="mt-3 text-xs text-gray-400">
              このページは自動で更新されます
            </p>
          )}
        </div>

        {/* 注文内容 */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">注文内容</h3>
          <ul className="divide-y text-sm">
            {order.order_items.map((item, i) => (
              <li key={i} className="flex justify-between py-2 text-gray-700">
                <span>{item.name} × {item.qty}</span>
                <span>¥{(item.price * item.qty).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between font-bold text-gray-900 pt-2 border-t">
            <span>合計</span>
            <span>¥{order.total_amount.toLocaleString()}</span>
          </div>
        </div>
      </main>
    </div>
  )
}
