'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type OrderItem = { name: string; qty: number; price: number; combo_id?: string | null; combo_label?: string | null }

type Order = {
  id: string
  order_number: number
  status: string
  total_amount: number
  estimated_ready_at: string | null
  accepted_at: string | null
  created_at: string
  customer_note: string | null
  pickup_type?: string | null
  scheduled_at?: string | null
  order_items: OrderItem[]
}

const statusLabel: Record<string, string> = {
  paid:      '新規',
  accepted:  '受付済',
  preparing: '調理中',
  ready:     '受取可能',
}

// プロトタイプの border-left カラーリング
const borderColor: Record<string, string> = {
  paid:      'border-l-4 border-l-orange-500',
  accepted:  'border-l-4 border-l-blue-500',
  preparing: 'border-l-4 border-l-amber-500',
  ready:     'border-l-4 border-l-emerald-600',
}

// プロトタイプ準拠のステータスアイコン
const statusIcon: Record<string, string> = {
  paid:      '🔴',
  accepted:  '🔵',
  preparing: '🟡',
  ready:     '✅',
}

const statusBadgeBg: Record<string, string> = {
  paid:      'bg-orange-50 text-orange-700 border border-orange-200',
  accepted:  'bg-blue-50 text-blue-700 border border-blue-200',
  preparing: 'bg-amber-50 text-amber-700 border border-amber-200',
  ready:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

const nextActions: Record<string, { label: string; status: string; color: string }[]> = {
  paid:      [{ label: '受付', status: 'accepted', color: 'bg-blue-600 hover:bg-blue-700' }],
  accepted:  [{ label: '調理開始', status: 'preparing', color: 'bg-amber-600 hover:bg-amber-700' }],
  preparing: [{ label: '準備完了', status: 'ready', color: 'bg-emerald-600 hover:bg-emerald-700' }],
  ready:     [
    { label: '受取確認', status: 'completed', color: 'bg-gray-700 hover:bg-gray-800' },
    { label: '未受取', status: 'no_show', color: 'bg-red-400 hover:bg-red-500' },
  ],
}

const cancelableStatuses = ['paid', 'accepted', 'preparing']

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function elapsedMinutes(fromIso: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(fromIso).getTime()) / 60_000)
}

export default function OrderCard({ order, defaultWaitMinutes = 15 }: { order: Order; defaultWaitMinutes?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waitMinutes, setWaitMinutes] = useState(defaultWaitMinutes)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState<'out_of_stock' | 'store_cancel'>('store_cancel')
  // 経過分数を 30 秒ごとに更新
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const isDisabled = loading || isPending

  function handlePrint() {
    if (typeof window === 'undefined') return
    // 別ウィンドウで領収書を開いて印刷ダイアログを起動
    const url = `/orders/${order.id}/receipt`
    const w = window.open(url, '_blank', 'noopener,noreferrer,width=420,height=720')
    // window.open が popup 制限で null を返した場合は同タブで開く
    if (!w) window.location.href = url
  }

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
        ...(status === 'cancelled' ? { cancelledReasonType: cancelReason } : {}),
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
  const elapsedFromCreated = elapsedMinutes(order.created_at, now)
  const elapsedFromAccepted = order.accepted_at ? elapsedMinutes(order.accepted_at, now) : null

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${borderColor[order.status] ?? ''}`}>
      {/* ヘッダー: 大きい注文番号 + ステータスバッジ + 金額 */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-gray-900 text-3xl leading-none tabular-nums">
            #{order.order_number}
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 self-start ${statusBadgeBg[order.status] ?? ''}`}>
              <span aria-hidden>{statusIcon[order.status] ?? ''}</span>
              {statusLabel[order.status] ?? order.status}
            </span>
            <span className="text-xs text-gray-400">
              {formatTime(order.created_at)} 受付
              {order.status !== 'paid' && elapsedFromAccepted !== null && (
                <> ・ 受付から {elapsedFromAccepted}分経過</>
              )}
              {order.status === 'paid' && (
                <> ・ {elapsedFromCreated}分前</>
              )}
            </span>
            {order.pickup_type === 'scheduled' && order.scheduled_at && (
              <span className="text-[10px] font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 self-start mt-0.5">
                📅 {new Date(order.scheduled_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 指定
              </span>
            )}
            {order.pickup_type === 'standard' && (
              <span className="text-[10px] font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200 self-start mt-0.5">
                スタンダード
              </span>
            )}
          </div>
        </div>
        <span className="text-base font-bold text-gray-900 shrink-0">
          ¥{order.total_amount.toLocaleString()}
        </span>
      </div>

      {/* 本文 */}
      <div className="px-5 pb-4 space-y-3">
        <ul className="text-sm text-gray-700 space-y-1.5">
          {(() => {
            // combo_id ごとにグループ化（null は個別行）
            const groups: Array<
              | { type: 'item'; item: OrderItem; key: string }
              | { type: 'combo'; comboId: string; label: string; items: OrderItem[]; key: string }
            > = []
            const comboMap = new Map<string, OrderItem[]>()
            for (const it of order.order_items ?? []) {
              if (it.combo_id) {
                const arr = comboMap.get(it.combo_id) ?? []
                arr.push(it)
                comboMap.set(it.combo_id, arr)
              } else {
                groups.push({ type: 'item', item: it, key: `i-${groups.length}` })
              }
            }
            for (const [cid, items] of comboMap.entries()) {
              // 同一 combo_id でも複数個注文時は複数コピーに展開される。
              // アイテム名が重複した時点で新しいコピーとして分割する。
              const copies: OrderItem[][] = []
              let currentCopy: OrderItem[] = []
              const seenNames = new Set<string>()
              for (const it of items) {
                if (seenNames.has(it.name)) {
                  copies.push(currentCopy)
                  currentCopy = []
                  seenNames.clear()
                }
                currentCopy.push(it)
                seenNames.add(it.name)
              }
              if (currentCopy.length > 0) copies.push(currentCopy)
              for (let copyIdx = 0; copyIdx < copies.length; copyIdx++) {
                const copyItems = copies[copyIdx]
                groups.push({
                  type: 'combo',
                  comboId: cid,
                  label: copyItems[0]?.combo_label ?? 'セット',
                  items: copyItems,
                  key: `c-${cid}-${copyIdx}`,
                })
              }
            }
            return groups.map((g) => {
              if (g.type === 'item') {
                return (
                  <li key={g.key} className="flex justify-between">
                    <span>{g.item.name} <span className="text-gray-400">× {g.item.qty}</span></span>
                    <span className="text-gray-500">¥{(g.item.price * g.item.qty).toLocaleString()}</span>
                  </li>
                )
              }
              const comboTotal = g.items.reduce((s, it) => s + it.price * it.qty, 0)
              return (
                <li key={g.key} className="bg-amber-50/60 rounded-lg px-2 py-1.5">
                  <div className="flex justify-between">
                    <span className="font-semibold text-amber-900">🎁 {g.label}</span>
                    <span className="text-amber-900">¥{comboTotal.toLocaleString()}</span>
                  </div>
                  <ul className="ml-3 mt-0.5 text-xs text-amber-700/80 space-y-0.5">
                    {g.items.map((it, i) => (
                      <li key={i}>・{it.name} × {it.qty}</li>
                    ))}
                  </ul>
                </li>
              )
            })
          })()}
        </ul>

        {order.estimated_ready_at && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">
            受取予定 {formatTime(order.estimated_ready_at)}
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
          <p role="alert" className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* キャンセル確認 */}
        {confirmCancel && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-3">
            <p className="text-sm font-medium text-red-800">
              #{order.order_number} の注文をキャンセルしますか？
            </p>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-red-700">キャンセル理由</p>
              <label className="flex items-center gap-2 text-sm text-red-800 cursor-pointer">
                <input
                  type="radio"
                  name={`cancel-reason-${order.id}`}
                  value="out_of_stock"
                  checked={cancelReason === 'out_of_stock'}
                  onChange={() => setCancelReason('out_of_stock')}
                  className="accent-red-500"
                />
                食材・商品の在庫切れ
              </label>
              <label className="flex items-center gap-2 text-sm text-red-800 cursor-pointer">
                <input
                  type="radio"
                  name={`cancel-reason-${order.id}`}
                  value="store_cancel"
                  checked={cancelReason === 'store_cancel'}
                  onChange={() => setCancelReason('store_cancel')}
                  className="accent-red-500"
                />
                その他店舗都合
              </label>
            </div>
            <p className="text-xs text-red-600">
              お客様へキャンセル通知が自動で送られます。決済済みの場合は自動で返金されます。
            </p>
            <div className="flex gap-2">
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
                {isDisabled ? '処理中...' : 'キャンセルする'}
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

        {/* 印刷ボタン（accepted 以降の状態で利用可）*/}
        {['accepted', 'preparing', 'ready'].includes(order.status) && !confirmCancel && (
          <button
            type="button"
            onClick={handlePrint}
            className="w-full text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 py-2 rounded-lg transition-colors"
          >
            🖨 レシート印刷
          </button>
        )}
      </div>
    </div>
  )
}
