'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'admin error boundary',
      digest: error.digest,
      message: error.message,
    }))
  }, [error])

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900">管理画面でエラーが発生しました</h1>
        <p className="text-sm text-gray-500">
          ページを再読み込みしてください。問題が続く場合はサポートまでお知らせください。
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400">エラーID: {error.digest}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-xl bg-gray-900 text-white text-sm font-semibold py-3 hover:bg-gray-700 transition-colors"
          >
            再試行
          </button>
          <Link
            href="/admin/dashboard"
            className="flex-1 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold py-3 hover:bg-gray-200 transition-colors flex items-center justify-center"
          >
            ダッシュボード
          </Link>
        </div>
      </div>
    </div>
  )
}
