'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { urlBase64ToUint8Array } from '@/lib/push-client'

interface Props {
  storeId: string
}

const LS_KEY = 'mocal_push_subscribed'

// Bell icon (Heroicons outline 風)
// withSlash=true で OFF 表示 (knockout で白抜きの斜線をかけて可視性を確保)。
function BellIcon({ withSlash, className }: { withSlash: boolean; className?: string }) {
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
      {withSlash && (
        <>
          {/* knockout (背景色で白抜き) → 上から実線で OFF の斜線を強調 */}
          <line x1="3" y1="3" x2="21" y2="21" stroke="white" strokeWidth="4" />
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
        </>
      )}
    </svg>
  )
}

/**
 * Dashboard header の通知状態インジケータ。
 *
 * - 未 subscribe: bell-slash (gray) を表示。tap で permission 要求 + subscribe。
 * - subscribe 済: bell (green) を表示。tap で /admin/settings へ navigate
 *   (詳細操作はそちらに集約。テスト送信 / 解除 等)。
 * - Web Push 非対応 (普通の Safari tab 等): null。
 *
 * 対称な ON/OFF toggle は廃止。OFF を能動的に選ぶ場面が事実上無く、未設定状態
 * を視覚的に伝える方が UX 上有益との判断 (2026-06-08 user feedback)。
 */
export default function StorePushIndicator({ storeId }: Props) {
  const router = useRouter()
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window
      setSupported(isPushSupported)
      if (!isPushSupported) return

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
    })
  }, [])

  if (!supported) return null

  if (subscribed) {
    return (
      <button
        type="button"
        onClick={() => router.push('/admin/settings#push-notification')}
        aria-label="通知設定済み・詳細設定へ"
        className="text-emerald-600 hover:text-emerald-700 transition-colors shrink-0"
      >
        <BellIcon withSlash={false} className="w-6 h-6" />
      </button>
    )
  }

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
      // permission 拒否や API 失敗。indicator では握り潰し、settings page で詳細表示する想定。
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={subscribe}
      disabled={loading}
      aria-label="注文通知を有効にする"
      className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-60 shrink-0"
    >
      <BellIcon withSlash={true} className="w-6 h-6" />
    </button>
  )
}
