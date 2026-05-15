'use client'

import { useState, useTransition } from 'react'
import { removeMemberAction } from '@/app/actions/members'

interface Props {
  memberId: string
  email: string
}

export default function RemoveMemberButton({ memberId, email }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const handleRemove = () => {
    setConfirming(false)
    setError(null)
    startTransition(async () => {
      const result = await removeMemberAction(memberId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="text-right">
      {error && <p role="alert" className="text-xs text-red-600 mb-1">{error}</p>}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={isPending}
          aria-label={`${email} を削除`}
          className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
        >
          {isPending ? '削除中…' : '削除'}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="text-gray-600">削除しますか？</span>
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="text-red-600 font-medium hover:text-red-700 disabled:opacity-50"
          >
            削除する
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            キャンセル
          </button>
        </span>
      )}
    </div>
  )
}
