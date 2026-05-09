'use client'

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-5xl font-bold text-gray-200">500</p>
        <h1 className="mt-4 text-xl font-semibold text-gray-700">エラーが発生しました</h1>
        <p className="mt-2 text-sm text-gray-500">
          しばらく経ってから再試行してください。
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-block text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
