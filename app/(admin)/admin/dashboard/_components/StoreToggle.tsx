'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  overrideUntil?: string | null
}

export default function StoreToggle({ isOpen, overrideUntil: initialOverride }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOpen)
  const [overrideUntil, setOverrideUntil] = useState<string | null>(initialOverride ?? null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [mountedAt] = useState(() => Date.now())
  const overrideActive =
    overrideUntil !== null && new Date(overrideUntil).getTime() > mountedAt

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
    const json = await res.json().catch(() => ({}))
    if (json?.manual_override_until) {
      setOverrideUntil(json.manual_override_until)
    }
    startTransition(() => router.refresh())
  }

  async function clearOverride() {
    const prev = overrideUntil
    setOverrideUntil(null)
    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear_override: true }),
    })
    if (!res.ok) {
      setOverrideUntil(prev)
      setErrorMessage('解除に失敗しました')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={isPending}
        className={`inline-flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-full transition-all disabled:opacity-50 ${
          optimistic
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-gray-800 text-white hover:bg-gray-700'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          optimistic ? 'bg-white/50 animate-pulse' : 'bg-gray-500'
        }`} />
        {optimistic ? '受付中' : '受付停止中'}
      </button>

      {overrideActive && (
        <button
          type="button"
          onClick={clearOverride}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          自動制御オフ中
          <span className="underline underline-offset-2">· 解除する</span>
        </button>
      )}

      {errorMessage && (
        <p className="text-[10px] text-red-500 text-right">{errorMessage}</p>
      )}
    </div>
  )
}
