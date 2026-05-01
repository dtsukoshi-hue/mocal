'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type PermStatus = 'idle' | 'denied' | 'granted' | 'unsupported'

interface CustomerSub {
  order_id: string
  order_number: number | null
  status: string | null
  store_name: string | null
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

function detectInitialStatus(): PermStatus {
  if (typeof window === 'undefined') return 'idle'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return 'idle'
}

export default function NotificationPanel() {
  const [permStatus] = useState<PermStatus>(detectInitialStatus)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [subs, setSubs] = useState<CustomerSub[] | null>(null)
  const [loading, setLoading] = useState<'check' | 'unsub' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // マウント時に既存のサブスクリプションをチェック
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (permStatus !== 'granted') {
        if (!cancelled) setSubs([])
        return
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (!reg) { if (!cancelled) setSubs([]); return }
        const sub = await reg.pushManager.getSubscription()
        if (!sub) { if (!cancelled) setSubs([]); return }
        if (cancelled) return
        setEndpoint(sub.endpoint)

        const res = await fetch('/api/push/customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        if (!res.ok) {
          if (!cancelled) setError('通知の状態を取得できませんでした')
          return
        }
        const data = await res.json()
        if (!cancelled) setSubs(data.subscriptions ?? [])
      } catch (e) {
        if (!cancelled) {
          console.error('[NotificationPanel]', e)
          setError('通知の状態を取得できませんでした')
        }
      }
    }
    void check()
    return () => { cancelled = true }
  }, [permStatus])

  async function unsubscribeAll() {
    if (!endpoint) return
    if (!confirm('この端末の全ての通知を解除しますか？')) return
    setLoading('unsub')
    setError(null)
    try {
      // ① サーバ側 DB から削除
      const res = await fetch('/api/push/customer', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '解除に失敗しました')
        setLoading(null)
        return
      }
      // ② ブラウザ側 PushSubscription も解除
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        const sub = await reg?.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      } catch {
        // 無視（DB 側は既に解除済み）
      }
      setSubs([])
      setEndpoint(null)
    } finally {
      setLoading(null)
    }
  }

  if (permStatus === 'unsupported') {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">通知設定</p>
        <p className="text-xs text-gray-400">
          このブラウザは通知に対応していません
        </p>
      </section>
    )
  }

  if (permStatus === 'denied') {
    return (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 space-y-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">通知設定</p>
        <p className="text-sm text-amber-700">通知がブロックされています</p>
        <p className="text-xs text-gray-500">
          通知を受け取るには、ブラウザのサイト設定から通知を許可してください。
        </p>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 space-y-3">
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">通知設定</p>
        <p className="text-xs text-gray-500">
          注文ごとに「準備完了」通知を受け取れます。各注文ページで個別に有効化してください。
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {subs === null ? (
        <p className="text-xs text-gray-400">読み込み中...</p>
      ) : subs.length === 0 ? (
        <p className="text-xs text-gray-500">
          現在、この端末で受信中の通知はありません。
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-700 font-semibold">
            この端末で受信中: {subs.length} 件
          </p>
          <ul className="divide-y divide-gray-100 -mx-1">
            {subs.map((s) => (
              <li key={s.order_id} className="px-1 py-2">
                <Link
                  href={`/orders/${s.order_id}`}
                  className="flex items-center justify-between gap-2 text-sm text-gray-900 hover:text-amber-700"
                >
                  <span className="truncate">
                    {s.store_name ?? '店舗'} #{s.order_number ?? '?'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {s.status ? (STATUS_LABEL[s.status] ?? s.status) : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={unsubscribeAll}
            disabled={loading === 'unsub'}
            className="w-full text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 rounded-xl py-2.5 transition-colors disabled:opacity-50"
          >
            {loading === 'unsub' ? '解除中...' : 'この端末の通知を全て解除'}
          </button>
        </>
      )}
    </section>
  )
}
