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

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'granted') {
      setStatus('subscribed')
    } else if (Notification.permission === 'denied') {
      setStatus('denied')
    }
  }, [])

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })

      setStatus('subscribed')
    } catch (e) {
      console.error('[PushSubscriber] subscribe error:', e)
    }
  }

  if (status === 'subscribed' || status === 'unsupported') return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mx-4 mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-blue-800">
        {status === 'denied'
          ? 'ブラウザの設定から通知を許可してください'
          : '新規注文をプッシュ通知で受け取りますか？'}
      </p>
      {status !== 'denied' && (
        <button
          onClick={subscribe}
          className="text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg whitespace-nowrap"
        >
          通知を有効にする
        </button>
      )}
    </div>
  )
}
