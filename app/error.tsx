'use client'

// アプリ内のサーバー/クライアントエラーをまとめてキャッチする
// （Next.js が自動でこのファイルをエラー境界として使う）
//
// セキュリティ: 本番では error.message / stack をユーザーに見せない。
// ログ送信は Vercel が console.error を集約するためここで明示。

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // クライアント側の JSON ログ。digest はサーバー側ログとの突き合わせに使う。
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'app error boundary',
      digest: error.digest,
      // message / stack は本番ではログにのみ残す。表示はしない。
      message: error.message,
    }))
  }, [error])

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900">エラーが発生しました</h1>
        <p className="text-sm text-gray-500">
          時間をおいて再度お試しください。問題が続く場合はお問い合わせください。
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400">エラーID: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-xl bg-gray-900 text-white text-sm font-semibold py-3 hover:bg-gray-700 transition-colors"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
