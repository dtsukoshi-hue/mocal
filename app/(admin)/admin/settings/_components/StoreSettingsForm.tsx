'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]
const CUISINE_PRESETS = ['バーガー', 'カフェ', '居酒屋', 'イタリアン', 'アジアン', 'ラーメン', 'カレー', 'お弁当', 'デリ', 'スイーツ']

interface Props {
  initialName: string
  initialWaitMinutes: number
  initialArea: string
  initialCuisineType: string
}

export default function StoreSettingsForm({
  initialName,
  initialWaitMinutes,
  initialArea,
  initialCuisineType,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName)
  const [waitMinutes, setWaitMinutes] = useState(initialWaitMinutes)
  const [area, setArea] = useState(initialArea)
  const [cuisineType, setCuisineType] = useState(initialCuisineType)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isDirty =
    name.trim() !== initialName ||
    waitMinutes !== initialWaitMinutes ||
    area.trim() !== initialArea ||
    cuisineType.trim() !== initialCuisineType
  const isDisabled = loading || isPending || !isDirty

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        wait_minutes: waitMinutes,
        area: area.trim(),
        cuisine_type: cuisineType.trim(),
      }),
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
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {WAIT_OPTIONS.map((m) => (
            <option key={m} value={m}>{m} 分</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">注文受付時のデフォルト待ち時間。注文ごとに個別変更も可能です。</p>
      </div>

      <div>
        <label htmlFor="store-area" className="block text-sm font-semibold text-gray-700 mb-1">
          エリア
        </label>
        <input
          id="store-area"
          type="text"
          value={area}
          maxLength={30}
          placeholder="例: 清澄白河"
          onChange={(e) => setArea(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-xs text-gray-400 mt-1">ディスカバリーページのエリア絞り込みに使用されます。</p>
      </div>

      <div>
        <label htmlFor="store-cuisine" className="block text-sm font-semibold text-gray-700 mb-1">
          ジャンル
        </label>
        <input
          id="store-cuisine"
          type="text"
          value={cuisineType}
          list="cuisine-presets"
          maxLength={30}
          placeholder="例: バーガー"
          onChange={(e) => setCuisineType(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <datalist id="cuisine-presets">
          {CUISINE_PRESETS.map((c) => <option key={c} value={c} />)}
        </datalist>
        <p className="text-xs text-gray-400 mt-1">店舗一覧で同ジャンルでまとめて表示されます。</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
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
