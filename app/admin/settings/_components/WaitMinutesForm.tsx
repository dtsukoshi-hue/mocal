'use client'

import { useActionState } from 'react'
import { updateStoreSettingsAction } from '@/app/actions/store'

const WAIT_OPTIONS = [10, 15, 20, 30, 40, 60]

interface Props {
  defaultWaitMinutes: number
}

export default function WaitMinutesForm({ defaultWaitMinutes }: Props) {
  const [state, formAction, isPending] = useActionState(updateStoreSettingsAction, undefined)

  return (
    <form action={formAction} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <p className="font-semibold text-gray-900">デフォルト待ち時間</p>
        <p className="text-sm text-gray-500 mt-0.5">注文受理時に自動設定される目安時間</p>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-green-600">保存しました</p>
      )}

      <div className="flex flex-wrap gap-2">
        {WAIT_OPTIONS.map(m => (
          <label key={m} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="wait_minutes"
              value={m}
              defaultChecked={m === defaultWaitMinutes}
              className="accent-orange-500"
            />
            <span className="text-sm text-gray-700">{m}分</span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {isPending ? '保存中…' : '保存する'}
      </button>
    </form>
  )
}
