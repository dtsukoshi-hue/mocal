'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function StoreToggle({ isOpen }: { isOpen: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOpen)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function toggle() {
    const prev = optimistic
    const next = !optimistic
    setOptimistic(next)
    setErrorMessage(null)

    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_open: next }),
    })

    if (!res.ok) {
      setOptimistic(prev)
      setErrorMessage('更新に失敗しました。もう一度お試しください。')
      return
    }

    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={toggle}
        disabled={isPending}
        className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
          optimistic
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-600 hover:bg-red-200'
        }`}
      >
        {optimistic ? '受付中' : '受付停止中'}
      </button>
      {errorMessage && (
        <p className="text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  )
}
