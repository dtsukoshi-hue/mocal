'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr
}

function detectInitialStatus(): 'idle' | 'denied' | 'unsupported' | 'subscribed' {
  if (typeof window === 'undefined') return 'idle'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied'
  return 'idle'
}

interface Props {
  orderId: string
}

export default function CustomerPushSubscriber({ orderId }: Props) {
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied' | 'unsupported'>(detectInitialStatus)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ページリロード後もサブスクリプション済み状態を維持する
  useEffect(() => {
    if (status !== 'idle') return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration()
      .then(async (reg) => {
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        if (!sub) return
        // このオーダー向けにサーバー登録済みか確認（既存の customer endpoint を流用）
        const res = await fetch('/api/push/customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null)
        if (res?.ok) {
          const data = await res.json().catch(() => ({}))
          const subs: { order_id: string }[] = data.subscriptions ?? []
          if (subs.some((s) => s.order_id === orderId)) setStatus('subscribed')
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  async function subscribe() {
    setLoading(true)
    setErrorMsg(null)
    try {
      await navigator.serviceWorker.register('/sw.js')
      const reg = await navigator.serviceWorker.ready

      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus('denied')
        return
      }

      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as any,
      })

      const res = await fetch(`/api/orders/${orderId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setStatus('subscribed')
    } catch (e) {
      console.error('[CustomerPushSubscriber]', e)
      setErrorMsg(e instanceof Error ? e.message : '通知の登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'unsupported') return null
  if (status === 'subscribed') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
        <p className="text-sm text-emerald-800 font-semibold">🔔 準備完了通知を有効化しました</p>
        <p className="text-xs text-emerald-700 mt-0.5">
          お店から「準備完了」の通知が届きます。その場を離れても OK です。
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-gray-900">
          {status === 'denied'
            ? '通知がブロックされています'
            : '準備完了を通知で受け取る'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {status === 'denied'
            ? 'ブラウザの設定から通知を許可してください'
            : 'お店から「できました！」の通知が届きます。その場を離れても OK です。'}
        </p>
      </div>
      {errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
      {status !== 'denied' && (
        <button
          onClick={subscribe}
          disabled={loading}
          className="w-full rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold py-2.5 disabled:opacity-50 transition-colors"
        >
          {loading ? '登録中...' : '通知を許可する'}
        </button>
      )}
    </div>
  )
}
