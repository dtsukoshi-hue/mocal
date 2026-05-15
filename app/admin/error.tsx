'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-5xl font-bold text-gray-200" aria-hidden="true">エラー</p>
        <h1 className="text-xl font-semibold text-gray-700">問題が発生しました</h1>
        <p className="text-sm text-gray-500">
          しばらく経ってから再試行してください。
        </p>
        <div className="flex flex-col items-center gap-2 mt-4">
          <button
            onClick={reset}
            className="text-sm bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg"
          >
            再試行
          </button>
          <Link href="/admin/dashboard" className="text-sm text-gray-400 hover:text-gray-600">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    </main>
  )
}
