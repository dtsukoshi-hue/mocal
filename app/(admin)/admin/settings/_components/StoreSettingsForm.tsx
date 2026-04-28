'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

interface Props {
  initialName: string
  initialWaitMinutes: number
}

export default function StoreSettingsForm({ initialName, initialWaitMinutes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [waitMinutes, setWaitMinutes] = useState(initialWaitMinutes)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isDirty = name.trim() !== initialName || waitMinutes !== initialWaitMinutes
  const isDisabled = loading || isPending || !isDirty

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), wait_minutes: waitMinutes }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '保存に失敗しました')
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <label htmlFor="store-name" className="block text-sm font-semibold text-gray-700 mb-1">
          店舗名
        </label>
        <input
          id="store-name"
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <p className="text-xs text-gray-400 mt-1">注文画面・通知の宛先などに表示されます。最大 60 文字。</p>
      </div>

      <div>
        <label htmlFor="wait-minutes" className="block text-sm font-semibold text-gray-700 mb-1">
          標準の待ち時間
        </label>
        <select
          id="wait-minutes"
          value={waitMinutes}
          onChange={(e) => setWaitMinutes(Number(e.target.value))}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {WAIT_OPTIONS.map((m) => (
            <option key={m} value={m}>{m} 分</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">注文受理時のデフォルト待ち時間。注文ごとに個別変更も可能です。</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
      )}
      {success && !error && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">保存しました</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isDisabled}
        className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3 text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '保存中...' : '保存'}
      </button>
    </div>
  )
}
