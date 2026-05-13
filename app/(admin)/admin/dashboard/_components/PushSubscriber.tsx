'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const uint8Array = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) uint8Array[i] = rawData.charCodeAt(i)
  return uint8Array
}

// 初期状態をブラウザ機能から計算（useEffect 内 setState の代わり）
function detectInitialStatus(): 'idle' | 'denied' | 'unsupported' {
  if (typeof window === 'undefined') return 'idle'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied'
  return 'idle'
}

export default function PushSubscriber() {
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied' | 'unsupported'>(detectInitialStatus)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 既存のサブスクリプションを確認（ページ再読み込みで再表示しない）
  useEffect(() => {
    if (status !== 'idle') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration()
      .then(async (reg) => {
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        if (sub) setStatus('subscribed')
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function subscribe() {
    setLoading(true)
    setErrorMsg(null)
    try {
      // SW を登録して起動完了まで待つ
      await navigator.serviceWorker.register('/sw.js')
      const reg = await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      // 古いサブスクリプションがあれば先に解除（VAPIDキー更新時に必要）
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as any,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }

      setStatus('subscribed')
    } catch (e) {
      console.error('[PushSubscriber] subscribe error:', e)
      setErrorMsg(e instanceof Error ? e.message : '通知の登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'subscribed' || status === 'unsupported') return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mx-4 mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-amber-900">
          {status === 'denied'
            ? 'ブラウザの設定から通知を許可してください'
            : '新規注文をプッシュ通知で受け取りますか？'}
        </p>
        {status !== 'denied' && (
          <button
            onClick={subscribe}
            disabled={loading}
            className="text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
          >
            {loading ? '登録中...' : '通知を有効にする'}
          </button>
        )}
      </div>
      {errorMsg && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  )
}
