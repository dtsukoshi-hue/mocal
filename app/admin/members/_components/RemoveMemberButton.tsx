'use client'

import { useState, useTransition } from 'react'
import { removeMemberAction } from '@/app/actions/members'

interface Props {
  memberId: string
}

export default function RemoveMemberButton({ memberId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRemove = () => {
    if (!confirm('このスタッフを削除しますか？')) return
    setError(null)
    startTransition(async () => {
      const result = await removeMemberAction(memberId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="text-right">
      {error && <p role="alert" className="text-xs text-red-600 mb-1">{error}</p>}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
      >
        {isPending ? '削除中…' : '削除'}
      </button>
    </div>
  )
}
