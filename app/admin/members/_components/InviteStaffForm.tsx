'use client'

import { useActionState, useEffect, useRef } from 'react'
import { inviteStaffAction } from '@/app/actions/members'

export default function InviteStaffForm() {
  const [state, formAction, isPending] = useActionState(inviteStaffAction, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state && 'success' in state) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <p className="font-semibold text-gray-900">スタッフを追加</p>
      <p className="text-xs text-gray-500">
        追加するスタッフは事前に mocal に登録済みである必要があります。
      </p>

      {state && 'error' in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p className="text-sm text-green-600">{state.success}</p>
      )}

      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="staff@example.com"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 shrink-0"
        >
          追加
        </button>
      </div>
    </form>
  )
}
