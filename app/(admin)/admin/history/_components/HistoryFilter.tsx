'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

const RANGES = [
  { key: '1d', label: '今日' },
  { key: '7d', label: '7日間' },
  { key: '30d', label: '30日間' },
  { key: '90d', label: '90日間' },
]

const STATUSES = [
  { key: '',          label: 'すべて' },
  { key: 'completed', label: '受取完了' },
  { key: 'no_show',   label: '未受取' },
  { key: 'cancelled', label: 'キャンセル' },
  { key: 'refunded',  label: '返金済' },
]

export default function HistoryFilter({
  currentRange,
  currentStatus,
}: {
  currentRange: string
  currentStatus: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`/admin/history?${params.toString()}`)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 期間フィルター */}
      <div className="flex gap-1.5 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => update('range', r.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              currentRange === r.key
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ステータスフィルター */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => update('status', s.key)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              (currentStatus ?? '') === s.key
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
