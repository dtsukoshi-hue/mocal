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
    <form ref={formRef} action={formAction} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
      <p className="font-semibold text-gray-900">スタッフを追加</p>
      <p className="text-xs text-gray-500">
        追加するスタッフは事前に mocal に登録済みである必要があります。
      </p>

      {state && 'error' in state && (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      )}
      {state && 'success' in state && (
        <p role="status" className="text-sm text-emerald-700">{state.success}</p>
      )}

      <div className="flex gap-2">
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="staff@example.com"
          aria-label="追加するスタッフのメールアドレス"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 shrink-0"
        >
          追加
        </button>
      </div>
    </form>
  )
}
