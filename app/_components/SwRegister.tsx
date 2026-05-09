'use client'

import { useEffect } from 'react'

// サービスワーカーを初回ロード時に登録（アイコンプリキャッシュ + プッシュ通知の準備）
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {/* SW 未対応環境では無視 */})
    }
  }, [])

  return null
}
