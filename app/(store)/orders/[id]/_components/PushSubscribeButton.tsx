'use client'

import { useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push-client'

interface Props {
  orderId: string
}

export default function PushSubscribeButton({ orderId }: Props) {
  const lsKey = `mocal_order_push_${orderId}`
  // SSR では window が未定義のため遅延初期化で判定
  const [supported] = useState(() =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
  )
  // localStorage ヒントで初期 UI を先行表示（フラッシュ防止）
  const [subscribed, setSubscribed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(`mocal_order_push_${orderId}`) === '1'
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (supported) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          const isSubscribed = !!sub
          setSubscribed(isSubscribed)
          if (isSubscribed) localStorage.setItem(lsKey, '1')
          else localStorage.removeItem(lsKey)
        })
        .catch(() => {})
    }
  // supported は mount 時に確定した静的値なので依存配列から除外可
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey])

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
        body: JSON.stringify({ subscription: serialized, orderId }),
      })
      localStorage.setItem(lsKey, '1')
      setSubscribed(true)
    } catch {
      // 通知許可が拒否された場合など
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
      localStorage.removeItem(lsKey)
      setSubscribed(false)
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  if (subscribed) {
    return (
      <button
        onClick={unsubscribe}
        disabled={loading}
        className="text-xs text-gray-400 underline"
      >
        通知をオフにする
      </button>
    )
  }

  return (
    <button
      onClick={subscribe}
      disabled={loading}
      className="w-full rounded-xl border border-orange-300 text-orange-600 text-sm font-medium py-3 hover:bg-orange-50 transition-colors disabled:opacity-60"
    >
      {loading ? '設定中...' : '🔔 準備完了の通知を受け取る'}
    </button>
  )
}
