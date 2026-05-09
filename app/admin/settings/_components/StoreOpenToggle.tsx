'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleStoreOpenAction } from '@/app/actions/store'

interface Props {
  isOpen: boolean
}

export default function StoreOpenToggle({ isOpen }: Props) {
  const [optimisticOpen, setOptimisticOpen] = useOptimistic(isOpen)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      setOptimisticOpen(!optimisticOpen)
      await toggleStoreOpenAction(!optimisticOpen)
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">受付状態</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {optimisticOpen ? '現在受付中です' : '現在受付を停止しています'}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={isPending}
          role="switch"
          aria-checked={optimisticOpen}
          aria-label={optimisticOpen ? '受付を停止する' : '受付を開始する'}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-500 ${
            optimisticOpen ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              optimisticOpen ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
