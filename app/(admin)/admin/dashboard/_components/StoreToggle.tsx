'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function StoreToggle({ isOpen }: { isOpen: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOpen)

  async function toggle() {
    const next = !optimistic
    setOptimistic(next)
    await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_open: next }),
    })
    startTransition(() => router.refresh())
  }

  return (
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
  )
}
