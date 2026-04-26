'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buffer
}

export default function PushSubscriber() {
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'denied' | 'unsupported'>('idle')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    // 許可済みでも実際にDBへサブスクリプションが登録されているか確認
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription()
      ).then(sub => {
        if (sub) {
          // 既存サブスクリプションをDBに再登録（べき等）
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub.toJSON()),
          }).then(res => {
            if (res.ok) setStatus('subscribed')
          }).catch(() => setStatus('idle'))
        }
        // sub が null なら idle のまま → バナー表示してボタンを押させる
      }).catch(() => {
        // エラー時は idle のままバナーを表示
      })
    }
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

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mx-4 mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-blue-800">
          {status === 'denied'
            ? 'ブラウザの設定から通知を許可してください'
            : '新規注文をプッシュ通知で受け取りますか？'}
        </p>
        {status !== 'denied' && (
          <button
            onClick={subscribe}
            disabled={loading}
            className="text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 px-3 py-1.5 rounded-lg whitespace-nowrap"
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
