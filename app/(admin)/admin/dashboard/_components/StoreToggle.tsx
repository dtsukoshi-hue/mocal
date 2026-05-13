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

  // マウント時点の現在時刻で判定（Date.now を render で呼ばない）
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
    <div className="flex flex-col items-start gap-1.5">
      <button
        onClick={toggle}
        disabled={isPending}
        className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
          optimistic
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-600 hover:bg-red-200'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${optimistic ? 'bg-green-500' : 'bg-red-400'}`} />
        {optimistic ? '受付中' : '受付停止中'}
      </button>

      {overrideActive && (
        <button
          type="button"
          onClick={clearOverride}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-xs text-amber-700/80 hover:text-amber-900 transition-colors disabled:opacity-50 group"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
          <span>スケジュール自動制御をオフ中</span>
          <span className="underline underline-offset-2 decoration-amber-400 group-hover:decoration-amber-600">解除する</span>
        </button>
      )}

      {errorMessage && (
        <p className="text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  )
}
