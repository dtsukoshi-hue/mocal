'use client'

import { useActionState } from 'react'
import { saveStoreHoursAction } from '@/app/actions/store'

interface HourRow {
  dow: number
  label: string
  open_time: string
  close_time: string
  is_closed: boolean
}

interface Props {
  hours: HourRow[]
}

export default function HoursForm({ hours }: Props) {
  const [state, action, pending] = useActionState(saveStoreHoursAction, undefined)

  return (
    <form action={action} className="space-y-3">
      {hours.map(({ dow, label, open_time, close_time, is_closed }) => (
        <HourRow
          key={dow}
          dow={dow}
          label={label}
          defaultOpenTime={open_time}
          defaultCloseTime={close_time}
          defaultIsClosed={is_closed}
        />
      ))}

      {state?.error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
          保存しました。
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold text-sm rounded-xl px-4 py-3 transition-colors"
      >
        {pending ? '保存中…' : '保存する'}
      </button>
    </form>
  )
}

function HourRow({
  dow,
  label,
  defaultOpenTime,
  defaultCloseTime,
  defaultIsClosed,
}: {
  dow: number
  label: string
  defaultOpenTime: string
  defaultCloseTime: string
  defaultIsClosed: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      {/* 曜日ラベル */}
      <span className="w-6 shrink-0 text-sm font-bold text-gray-700 text-center">
        {label}
      </span>

      {/* 定休日チェック（hidden + checkbox で formData に 1 / null） */}
      <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
        <input
          type="checkbox"
          name={`is_closed_${dow}`}
          value="1"
          defaultChecked={defaultIsClosed}
          className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
        />
        <span className="text-xs text-gray-600">定休日</span>
      </label>

      {/* 時間入力 */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <input
          type="time"
          name={`open_${dow}`}
          defaultValue={defaultOpenTime}
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <span className="text-xs text-gray-400 shrink-0">〜</span>
        <input
          type="time"
          name={`close_${dow}`}
          defaultValue={defaultCloseTime}
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
    </div>
  )
}
