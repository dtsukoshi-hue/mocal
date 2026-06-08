'use client'

import { useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push-client'

interface Props {
  storeId: string
}

const LS_KEY = 'mocal_push_subscribed'

/**
 * Settings ページの「注文通知」section。
 *
 * Dashboard header の StorePushIndicator がアイコンだけのインジケータなのに対し、
 * こちらはフル機能 (subscribe / test 送信 / unsubscribe) を扱う。
 *
 * UX 設計 (2026-06-08 user feedback):
 * - OFF の能動操作は事実上不要 (受付停止中で注文自体止められる、OS で通知 OFF も可)
 * - そのため「テスト送信」「通知を解除」を header から削除して settings に集約
 * - 初回 setup を強く誘導するため、未設定時は説明 + 強調ボタンを表示
 */
export default function StorePushSettings({ storeId }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

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

  const subscribe = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })
      const serialized = JSON.parse(JSON.stringify(sub))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: serialized, storeId }),
      })
      if (!res.ok) throw new Error('API failed')
      localStorage.setItem(LS_KEY, '1')
      setSubscribed(true)
      setMessage({ type: 'ok', text: '通知を有効にしました。' })
    } catch {
      setMessage({ type: 'err', text: '通知を有効にできませんでした。OS の設定で mocal の通知許可を確認してください。' })
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    setLoading(true)
    setMessage(null)
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
      setMessage({ type: 'ok', text: '通知を解除しました。' })
    } catch {
      setMessage({ type: 'err', text: '解除に失敗しました。時間をおいて再試行してください。' })
    } finally {
      setLoading(false)
    }
  }

  const sendTest = async () => {
    setTestLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      if (!res.ok) throw new Error('API failed')
      setMessage({ type: 'ok', text: 'テスト通知を送信しました。数秒以内にこの端末に届きます。' })
    } catch {
      setMessage({ type: 'err', text: 'テスト送信に失敗しました。' })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div id="push-notification" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 scroll-mt-20">
      <div>
        <p className="font-semibold text-gray-900">注文通知</p>
        <p className="text-sm text-gray-500 mt-0.5">
          新規注文があった時にこの端末へプッシュ通知を送ります。<strong>営業開始前に必ず一度有効化してください。</strong>
        </p>
      </div>

      {supported === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          この端末／ブラウザは Web Push 非対応です。iPhone の場合は <strong>ホーム画面に追加</strong> したアイコンから起動してください。
        </div>
      )}

      {supported && !subscribed && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800">
            <p><span aria-hidden="true">⚠️</span> <strong>この端末では通知を受け取れません</strong></p>
            <p>下のボタンから有効化してください。OS の許可ダイアログが表示されます。</p>
          </div>
          <button
            type="button"
            onClick={subscribe}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
          >
            {loading ? '設定中…' : '通知を有効にする'}
          </button>
        </div>
      )}

      {supported && subscribed && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 inline-flex items-center gap-2">
            <span aria-hidden="true">✓</span> この端末で通知を受け取れます
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={testLoading}
              className="text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-stone-50 transition-colors disabled:opacity-60"
            >
              {testLoading ? '送信中…' : 'テスト通知を送る'}
            </button>
            <button
              type="button"
              onClick={unsubscribe}
              disabled={loading}
              className="text-sm text-gray-500 hover:text-red-700 underline disabled:opacity-60"
            >
              この端末の通知を解除
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.type === 'err' ? 'alert' : 'status'}
          className={`text-xs ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
