'use client'

import { useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push-client'

interface Props {
  storeId: string
}

const LS_KEY = 'mocal_push_subscribed'

// Heroicons の bell (outline) を inline SVG で。AdminNav の戻る矢印と同じ
// stroke スタイルで統一感を保つ。色は親要素から currentColor で継承。
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export default function StorePushSubscribe({ storeId }: Props) {
  // クライアントマウント後にのみ Push 対応を確認（SSR では常に false）
  const [supported, setSupported] = useState(false)
  // 初期値は常に false（サーバー/クライアント一致）。useEffect でローカルストレージから復元。
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)

  useEffect(() => {
    // マウント後の非同期処理（feature detection / 復元）。
    // microtask に回して effect 同期実行を避ける
    // (react-hooks/set-state-in-effect 回避)。
    queueMicrotask(() => {
      const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window
      setSupported(isPushSupported)

      if (isPushSupported) {
        // localStorage ヒントで先行表示（SW 確認前のフラッシュ防止）
        if (localStorage.getItem(LS_KEY) === '1') setSubscribed(true)

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
    })
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
      <span className="text-xs text-green-600 flex items-center gap-1 whitespace-nowrap shrink-0">
        <BellIcon className="w-4 h-4" />
        <span className="hidden sm:inline">注文通知 ON</span>
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
      className="text-sm text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-stone-50 disabled:opacity-60 whitespace-nowrap shrink-0"
    >
      {loading ? '設定中...' : (
        <span className="inline-flex items-center gap-1.5">
          <BellIcon className="w-4 h-4" />
          <span className="hidden sm:inline">注文通知を受け取る</span>
        </span>
      )}
    </button>
  )
}
