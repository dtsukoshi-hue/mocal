'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

interface Props {
  isOpen: boolean
  waitMinutes: number
}

export default function HoursPanel({ isOpen: initialIsOpen, waitMinutes: initialWait }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(initialIsOpen)
  const [waitMinutes, setWaitMinutes] = useState(initialWait)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function patch(body: Record<string, unknown>) {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '更新に失敗しました')
      setLoading(false)
      return false
    }
    setSuccess(true)
    setLoading(false)
    startTransition(() => router.refresh())
    return true
  }

  async function toggleOpen() {
    const next = !isOpen
    setIsOpen(next)
    const ok = await patch({ is_open: next })
    if (!ok) setIsOpen(!next)
  }

  async function saveWait() {
    await patch({ wait_minutes: waitMinutes })
  }

  return (
    <div className="space-y-4">
      {/* 受付トグル */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">本日の注文受付</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              一時的にON/OFFできます
            </p>
          </div>
          <button
            onClick={toggleOpen}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-bold text-sm transition-colors disabled:opacity-50 ${
              isOpen
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {isOpen ? '受付中' : '受付停止中'}
          </button>
        </div>
      </section>

      {/* 予定受取時間 */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">予定受取時間</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            注文受付時のデフォルト受取目安。注文ごとに個別変更も可能。
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {WAIT_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setWaitMinutes(m)}
              className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                waitMinutes === m
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {m}分
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
        {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">保存しました</p>}
        <button
          onClick={saveWait}
          disabled={loading || waitMinutes === initialWait}
          className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3 text-sm hover:bg-gray-700 disabled:opacity-40"
        >
          {loading ? '保存中...' : '受取時間を保存'}
        </button>
      </section>

      {/* 定期営業時間（プレースホルダー）*/}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900">🗓 定期営業時間</h2>
          <span className="text-xs text-gray-400">準備中</span>
        </div>
        <p className="text-xs text-gray-500">
          曜日ごとの開店時間・閉店時間・定休日を設定できます。
          現在は手動の「受付中／停止」トグルのみ対応しています。
        </p>
      </section>
    </div>
  )
}
