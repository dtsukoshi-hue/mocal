'use client'

import { useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push-client'

interface Props {
  storeId: string
}

const LS_KEY = 'mocal_push_subscribed'

export default function StorePushSubscribe({ storeId }: Props) {
  // SSR では window が未定義のため遅延初期化で判定
  const [supported] = useState(() =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  )
  // localStorage ヒントで初期 UI を先行表示（フラッシュ防止）
  const [subscribed, setSubscribed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(LS_KEY) === '1'
  )
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)

  useEffect(() => {
    if (supported) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          const isSubscribed = !!sub
          setSubscribed(isSubscribed)
          if (isSubscribed) {
            localStorage.setItem(LS_KEY, '1')
          } else {
            localStorage.removeItem(LS_KEY)
          }
        })
        .catch(() => {})
    }
  // supported は mount 時に確定した静的値なので依存配列から除外可
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!supported) return null

  const subscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })
      const serialized = JSON.parse(JSON.stringify(sub))
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: serialized, storeId }),
      })
      localStorage.setItem(LS_KEY, '1')
      setSubscribed(true)
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      localStorage.removeItem(LS_KEY)
      setSubscribed(false)
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  const sendTest = async () => {
    setTestLoading(true)
    try {
      await fetch('/api/push/test', { method: 'POST' })
    } finally {
      setTestLoading(false)
    }
  }

  if (subscribed) {
    return (
      <span className="text-xs text-green-600 flex items-center gap-1">
        <span aria-hidden="true">🔔</span> 注文通知 ON
        <button onClick={sendTest} disabled={testLoading} className="text-gray-400 underline ml-1 disabled:opacity-50" aria-label="テスト通知を送る">
          {testLoading ? '送信中…' : 'テスト'}
        </button>
        <button onClick={unsubscribe} disabled={loading} aria-label="注文通知をオフにする" className="text-gray-400 underline ml-1">
          オフ
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      className="text-sm text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? '設定中...' : <><span aria-hidden="true">🔔</span>{' '}注文通知を受け取る</>}
    </button>
  )
}
