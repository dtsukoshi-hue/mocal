'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, OrderStatus } from '@/lib/database.types'
import { saveOrderToHistory } from '@/lib/order-history'
import CustomerPushSubscriber from './CustomerPushSubscriber'

// Supabase anon キーの Realtime は RLS (orders_user_own_select) で
// 匿名ユーザーに届かない可能性が高い。20 秒ポーリングをフォールバックとして設ける。
const POLL_INTERVAL_MS = 20_000
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'refunded', 'no_show'])

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  estimated_ready_at: string | null
  customer_note: string | null
  stores: { name: string } | null
  order_items: { name: string; qty: number; price: number }[]
}

interface Props {
  order: Order
}

// Progress steps for normal flow
const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'paid',      label: '注文受付' },
  { key: 'accepted',  label: '受付' },
  { key: 'preparing', label: '調理中' },
  { key: 'ready',     label: '準備完了' },
  { key: 'completed', label: '受取完了' },
]

const NORMAL_STATUSES = new Set<string>(['paid', 'accepted', 'preparing', 'ready', 'completed'])

const STATUS_CONFIG: Record<string, { label: string; icon: string; description: string; color: string }> = {
  pending:   { label: '決済処理中',   icon: '⏳', description: '決済を確認しています...',                     color: 'text-gray-500' },
  paid:      { label: '注文受付済',   icon: '✅', description: '店舗の受付をお待ちください',                  color: 'text-blue-600' },
  accepted:  { label: '受付済',       icon: '👨‍🍳', description: '調理を開始します',                          color: 'text-purple-600' },
  preparing: { label: '調理中',       icon: '🍳', description: '準備中です。もうしばらくお待ちください',     color: 'text-orange-600' },
  ready:     { label: '準備完了！',   icon: '🎉', description: 'カウンターへお越しください',                  color: 'text-emerald-600' },
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
  const router = useRouter()
  const refreshedAt = useRef(0)

  // router.refresh() 後に新しい initialOrder が props として届いたら state に同期する
  useEffect(() => {
    setOrder(initialOrder)
  // initialOrder オブジェクトの参照は毎 refresh で変わるが、
  // status と estimated_ready_at の変化だけ監視すれば十分
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder.status, initialOrder.estimated_ready_at])

  // ブラウザの履歴に保存（再訪問時に /orders ページから一覧で見られるようにする）
  useEffect(() => {
    saveOrderToHistory(order.id)
  }, [order.id])

  // Realtime サブスクリプション（RLS が通れば即時更新）
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
          refreshedAt.current = Date.now() // Realtime が届いたらポーリングリセット
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  // ポーリングフォールバック（Realtime が届かない場合も定期的にサーバーデータを再取得）
  // 終了ステータスになったらポーリング停止
  useEffect(() => {
    if (TERMINAL_STATUSES.has(order.status)) return
    const id = setInterval(() => {
      const now = Date.now()
      if (now - refreshedAt.current < 3_000) return
      refreshedAt.current = now
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status])

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
  const isNormalFlow = NORMAL_STATUSES.has(order.status)
  const currentStepIndex = getStepIndex(order.status)

  // ready / completed / cancelled / refunded / no_show 等の終了状態では通知不要
  const showPushOptIn = ['paid', 'accepted', 'preparing'].includes(order.status)

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
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

      <main id="main-content" className="max-w-lg mx-auto px-4 py-6 flex-1 w-full space-y-4">

        {/* 受取番号（最重要・大きく表示）*/}
        <div className={`bg-white rounded-2xl shadow-sm p-6 text-center ${
          order.status === 'ready' ? 'ring-4 ring-emerald-400' : ''
        }`}>
          <div className="text-4xl mb-2">{config.icon}</div>
          <h2 className={`text-lg font-bold mb-3 ${config.color}`}>{config.label}</h2>
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-1">受取番号</p>
          <p className="text-7xl font-black text-gray-900 tabular-nums leading-none mb-2">
            {String(order.order_number).padStart(3, '0')}
          </p>
          <p className="text-sm text-gray-500">{config.description}</p>

          {order.status === 'ready' && (
            <p className="mt-3 text-xs text-emerald-700 font-semibold">
              番号を呼ばれたらお受け取りください
            </p>
          )}

          {order.estimated_ready_at && ['accepted', 'preparing', 'ready'].includes(order.status) && (
            <div className="mt-4 inline-block bg-amber-50 text-amber-700 text-sm font-semibold px-4 py-2 rounded-full border border-amber-200">
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
                        active  ? 'bg-amber-600 text-white ring-4 ring-amber-100' :
                                  'bg-gray-100 text-gray-400'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] text-center leading-tight ${
                        active ? 'text-amber-700 font-semibold' :
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

        {/* 準備完了通知のオプトイン */}
        {showPushOptIn && (
          <CustomerPushSubscriber orderId={order.id} />
        )}

        {order.customer_note && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 mb-0.5">📝 ご要望</p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
              {order.customer_note}
            </p>
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

        {/* 領収書リンク（completed のみ）*/}
        {order.status === 'completed' && (
          <Link
            href={`/orders/${order.id}/receipt`}
            className="block bg-white rounded-2xl shadow-sm p-4 text-center text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
          >
            📄 領収書を表示
          </Link>
        )}

      </main>
    </div>
  )
}
