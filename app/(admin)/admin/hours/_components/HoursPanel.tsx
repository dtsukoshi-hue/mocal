'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
// プロトタイプ「定期営業時間」のデフォルト
const DEFAULT_OPEN  = '11:00'
const DEFAULT_CLOSE = '22:00'

interface Props {
  isOpen: boolean
  waitMinutes: number
  overrideUntil: string | null
}

interface HoursRow {
  weekday: number
  is_open: boolean
  open_time: string
  close_time: string
  last_order: string
}

function blankRow(weekday: number): HoursRow {
  return { weekday, is_open: true, open_time: DEFAULT_OPEN, close_time: DEFAULT_CLOSE, last_order: '' }
}

function normalizeTime(t: string | null | undefined): string {
  if (!t) return ''
  // 'HH:MM:SS' → 'HH:MM'
  return t.length >= 5 ? t.slice(0, 5) : t
}

export default function HoursPanel({ isOpen: initialIsOpen, waitMinutes: initialWait, overrideUntil: initialOverride }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(initialIsOpen)
  const [waitMinutes, setWaitMinutes] = useState(initialWait)
  const [overrideUntil, setOverrideUntil] = useState<string | null>(initialOverride)
  const [hours, setHours] = useState<HoursRow[]>(() => Array.from({ length: 7 }, (_, i) => blankRow(i)))
  const [hoursLoaded, setHoursLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState<'toggle' | 'wait' | 'hours' | 'clear' | null>(null)

  // 既存の営業時間をフェッチ
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/hours')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (Array.isArray(data?.hours) && data.hours.length > 0) {
          const map = new Map<number, HoursRow>()
          for (const h of data.hours) {
            map.set(h.weekday, {
              weekday: h.weekday,
              is_open: !!h.is_open,
              open_time:  normalizeTime(h.open_time)  || DEFAULT_OPEN,
              close_time: normalizeTime(h.close_time) || DEFAULT_CLOSE,
              last_order: normalizeTime(h.last_order),
            })
          }
          setHours(Array.from({ length: 7 }, (_, i) => map.get(i) ?? blankRow(i)))
        }
        setHoursLoaded(true)
      })
      .catch(() => setHoursLoaded(true))
    return () => { cancelled = true }
  }, [])

  async function patchStore(body: Record<string, unknown>, key: 'toggle' | 'wait' | 'clear') {
    setLoading(key)
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
      setLoading(null)
      return null
    }
    const json = await res.json().catch(() => ({}))
    setSuccess(true)
    setLoading(null)
    startTransition(() => router.refresh())
    return json
  }

  async function toggleOpen() {
    const next = !isOpen
    setIsOpen(next)
    const json = await patchStore({ is_open: next }, 'toggle')
    if (!json) {
      setIsOpen(!next)
    } else if (json.manual_override_until) {
      setOverrideUntil(json.manual_override_until)
    }
  }

  async function clearOverride() {
    const json = await patchStore({ clear_override: true }, 'clear')
    if (json) {
      setOverrideUntil(null)
    }
  }

  async function saveWait() {
    await patchStore({ wait_minutes: waitMinutes }, 'wait')
  }

  // マウント時点の現在時刻で判定（Date.now を render で呼ばない）
  const [mountedAt] = useState(() => Date.now())
  const overrideActive =
    overrideUntil !== null && new Date(overrideUntil).getTime() > mountedAt
  const overrideUntilLabel = overrideActive
    ? new Date(overrideUntil!).toLocaleString('ja-JP', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''

  function updateRow(weekday: number, patch: Partial<HoursRow>) {
    setHours((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)))
  }

  function applyToAllOpenDays() {
    // 月曜（index 1）の値を全営業日に適用
    const monday = hours.find((h) => h.weekday === 1)
    if (!monday) return
    setHours((prev) =>
      prev.map((r) =>
        r.is_open
          ? { ...r, open_time: monday.open_time, close_time: monday.close_time, last_order: monday.last_order }
          : r
      )
    )
  }

  async function saveHours() {
    setLoading('hours')
    setError(null)
    setSuccess(false)
    const payload = {
      hours: hours.map((h) => ({
        weekday: h.weekday,
        is_open: h.is_open,
        open_time:  h.is_open ? h.open_time  : null,
        close_time: h.is_open ? h.close_time : null,
        last_order: h.is_open && h.last_order ? h.last_order : null,
      })),
    }
    const res = await fetch('/api/admin/hours', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '保存に失敗しました')
      setLoading(null)
      return
    }
    setSuccess(true)
    setLoading(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* 受付トグル */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">本日の注文受付</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              定期営業時間に関わらず一時的にON/OFFできます
            </p>
          </div>
          <button
            onClick={toggleOpen}
            disabled={loading === 'toggle'}
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
        {overrideActive ? (
          <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 bg-amber-50 border border-amber-100">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 6v6l4 2" />
              </svg>
              <div className="text-xs text-amber-800 leading-snug min-w-0">
                <span className="font-semibold">スケジュール自動制御をオフ中</span>
                <span className="text-amber-600/80"> — {overrideUntilLabel} まで</span>
              </div>
            </div>
            <button
              type="button"
              onClick={clearOverride}
              disabled={loading === 'clear'}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 decoration-amber-400 hover:decoration-amber-600 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              {loading === 'clear' ? '解除中...' : '解除する'}
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">
            ※ 営業時間に基づき自動で切り替わります
          </p>
        )}
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
        <button
          onClick={saveWait}
          disabled={loading === 'wait' || waitMinutes === initialWait}
          className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3 text-sm hover:bg-gray-700 disabled:opacity-40"
        >
          {loading === 'wait' ? '保存中...' : '受取時間を保存'}
        </button>
      </section>

      {/* 定期営業時間（曜日別）*/}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">🗓 定期営業時間</h2>
          <button
            type="button"
            onClick={applyToAllOpenDays}
            className="text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors"
          >
            一括編集（月の値を反映）
          </button>
        </div>

        {!hoursLoaded ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-2 py-1 animate-pulse">
                <div className="w-6 h-4 bg-gray-100 rounded" />
                <div className="w-16 h-6 bg-gray-100 rounded-full" />
                <div className="flex-1 h-6 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {hours.map((row) => (
              <div key={row.weekday} className="flex items-center gap-2 py-1">
                <span className="w-6 text-sm font-bold text-gray-700">
                  {WEEKDAY_LABELS[row.weekday]}
                </span>
                <button
                  type="button"
                  onClick={() => updateRow(row.weekday, { is_open: !row.is_open })}
                  className={`text-xs font-bold px-2 py-1 rounded-full border w-16 ${
                    row.is_open
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}
                >
                  {row.is_open ? '営業' : '定休'}
                </button>
                {row.is_open ? (
                  <>
                    <input
                      type="time"
                      value={row.open_time}
                      onChange={(e) => updateRow(row.weekday, { open_time: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <span className="text-gray-400">〜</span>
                    <input
                      type="time"
                      value={row.close_time}
                      onChange={(e) => updateRow(row.weekday, { close_time: e.target.value })}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <input
                      type="time"
                      value={row.last_order}
                      onChange={(e) => updateRow(row.weekday, { last_order: e.target.value })}
                      placeholder="LO"
                      title="ラストオーダー"
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-20 text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </>
                ) : (
                  <span className="text-sm text-gray-400 flex-1">— 終日休業 —</span>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
        {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">保存しました</p>}

        <button
          onClick={saveHours}
          disabled={loading === 'hours' || !hoursLoaded}
          className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3 text-sm hover:bg-gray-700 disabled:opacity-40"
        >
          {loading === 'hours' ? '保存中...' : '定期営業時間を保存'}
        </button>

        <p className="text-[10px] text-gray-400 text-center">
          ※ 当日の「受付中／停止」トグルが優先されます。営業時間外の自動停止は今後対応。
        </p>
      </section>
    </div>
  )
}
