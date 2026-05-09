'use client'

import { useTransition } from 'react'
import { removeMemberAction } from '@/app/actions/members'

interface Props {
  memberId: string
}

export default function RemoveMemberButton({ memberId }: Props) {
  const [isPending, startTransition] = useTransition()

  const handleRemove = () => {
    if (!confirm('このスタッフを削除しますか？')) return
    startTransition(() => removeMemberAction(memberId))
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
    >
      {isPending ? '削除中…' : '削除'}
    </button>
  )
}
