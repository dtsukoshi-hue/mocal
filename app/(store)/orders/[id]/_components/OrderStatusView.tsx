'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, OrderStatus } from '@/lib/database.types'
import PushSubscribeButton from './PushSubscribeButton'

/** Realtime が機能しない環境向けのポーリング間隔（ミリ秒）*/
const POLLING_INTERVAL_MS = 30_000

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  pickup_type: string | null
  scheduled_at: string | null
  customer_note: string | null
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

// 通常フローのステップ（pending→completed）
const PROGRESS_STEPS: OrderStatus[] = ['pending', 'paid', 'accepted', 'preparing', 'ready', 'completed']

function OrderProgressBar({ status }: { status: string }) {
  // キャンセル・返金・未受取はプログレスバー非表示
  if (['cancelled', 'refunded', 'no_show'].includes(status)) return null

  const currentIdx = PROGRESS_STEPS.indexOf(status as OrderStatus)
  const stepLabels = ['決済中', '受付済', '受理', '調理中', '準備完了', '受取完了']

  return (
    <div className="px-4 pb-2" role="img" aria-label={`注文進捗: ${stepLabels[currentIdx] ?? '完了'}`}>
      <div className="flex items-center">
        {PROGRESS_STEPS.map((step, i) => {
          const isDone = i < currentIdx
          const isCurrent = i === currentIdx
          const isLast = i === PROGRESS_STEPS.length - 1
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isDone
                      ? 'bg-orange-500 text-white'
                      : isCurrent
                        ? 'bg-orange-500 text-white ring-2 ring-orange-200'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span
                  aria-hidden="true"
                  className={`mt-1 text-center leading-tight whitespace-nowrap text-gray-500 transition-colors ${
                    isCurrent ? 'text-orange-600 font-semibold' : isDone ? 'text-gray-400' : 'text-gray-300'
                  }`}
                  style={{ fontSize: '9px' }}
                >
                  {stepLabels[i]}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 mx-0.5 mb-4 transition-colors ${
                    i < currentIdx ? 'bg-orange-400' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LS_HISTORY_KEY = 'mocal_order_history'

type HistoryEntry = {
  id: string
  orderNumber: number
  storeName: string
  totalAmount: number
  createdAt: string  // ISO string saved at first visit
}

function saveToHistory(order: Order) {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    const history: HistoryEntry[] = raw ? JSON.parse(raw) : []
    // すでに保存済みなら更新しない
    if (history.some((e) => e.id === order.id)) return
    const entry: HistoryEntry = {
      id: order.id,
      orderNumber: order.order_number,
      storeName: order.stores?.name ?? '',
      totalAmount: order.total_amount,
      createdAt: new Date().toISOString(),
    }
    // 最新を先頭に、最大 50 件保持
    const updated = [entry, ...history].slice(0, 50)
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated))
  } catch {
    // localStorage 操作失敗は無視
  }
}

export default function OrderStatusView({ order: initialOrder }: Props) {
  const [order, setOrder] = useState(initialOrder)
  const router = useRouter()
  const realtimeActiveRef = useRef(false)
  const isTerminalRef = useRef(false)

  // 注文履歴を localStorage に保存（初回のみ）
  useEffect(() => {
    saveToHistory(initialOrder)
  // 初回のみ実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 完了・キャンセル系ならポーリング・Realtime 不要
  useEffect(() => {
    isTerminalRef.current = ['completed', 'cancelled', 'refunded', 'no_show'].includes(order.status)
  }, [order.status])

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
          realtimeActiveRef.current = true
          setOrder(prev => ({ ...prev, ...payload.new }))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeActiveRef.current = true
      })

    return () => { supabase.removeChannel(channel) }
  }, [order.id])

  // Realtime のフォールバック: 30s ごとに router.refresh() でサーバーデータを再取得
  // WebSocket が通らない環境（企業ネットワーク等）でも注文状態を追従できるようにする
  const refresh = useCallback(() => {
    if (!isTerminalRef.current) router.refresh()
  }, [router])

  useEffect(() => {
    const timer = setInterval(refresh, POLLING_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const config = STATUS_CONFIG[order.status as OrderStatus] ?? STATUS_CONFIG.pending
  const isTerminal = ['completed', 'cancelled', 'refunded', 'no_show'].includes(order.status)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 py-4">
          <p className="text-sm text-gray-500">{order.stores?.name}</p>
          <h1 className="text-lg font-bold text-gray-900">
            注文 #{order.order_number}
          </h1>
        </div>
        {/* プログレスバー */}
        <div className="max-w-lg mx-auto pt-2">
          <OrderProgressBar status={order.status} />
        </div>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-4 py-6 flex-1 space-y-4 w-full">
        {/* ステータス表示 */}
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center" aria-live="polite" aria-atomic="true">
          <div className="text-5xl mb-4" aria-hidden="true">{config.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{config.label}</h2>
          <p className="text-sm text-gray-500">{config.description}</p>

          {order.pickup_type === 'scheduled' && order.scheduled_at && (
            <div className="mt-4 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-sm font-semibold px-3 py-1.5 rounded-full">
              <span aria-hidden="true">🕐</span> 受取指定：<time dateTime={order.scheduled_at}>{new Date(order.scheduled_at).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Tokyo',
              })}</time>
            </div>
          )}

          {order.estimated_ready_at && ['accepted', 'preparing'].includes(order.status) && (
            <div className="mt-4 inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-sm font-semibold px-3 py-1.5 rounded-full">
              <span aria-hidden="true">⏱</span> 受取予定：<time dateTime={order.estimated_ready_at}>{new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Tokyo',
              })}</time>
            </div>
          )}

          {/* ページ自動更新の案内（pending） */}
          {order.status === 'pending' && (
            <p className="mt-4 text-xs text-gray-400">
              このページは自動で更新されます
            </p>
          )}
        </div>

        {/* 通知購読ボタン（完了・キャンセル系以外） */}
        {!isTerminal && (
          <PushSubscribeButton orderId={order.id} />
        )}

        {/* 領収書リンク（完了・返金済） */}
        {['completed', 'refunded'].includes(order.status) && (
          <Link
            href={`/orders/${order.id}/receipt`}
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-gray-200 text-gray-600 text-sm font-medium py-3 hover:bg-gray-50 transition-colors"
          >
            <span aria-hidden="true">🧾</span> 領収書を表示する
          </Link>
        )}

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

          {order.customer_note && (
            <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
              <span aria-hidden="true">📝</span> {order.customer_note}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
