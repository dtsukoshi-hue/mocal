'use client'

import { useState } from 'react'
import Link from 'next/link'

type HistoryEntry = {
  id: string
  orderNumber: number
  storeName: string
  totalAmount: number
  createdAt: string
}

const LS_HISTORY_KEY = 'mocal_order_history'

// このコンポーネントは { ssr: false } でインポートされるため window は必ず defined
function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

export default function OrderHistoryList() {
  // SSR なし（親が dynamic { ssr: false }）なので window は必ず存在する
  const [entries] = useState<HistoryEntry[]>(readHistory)

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4" aria-hidden="true">🧾</div>
        <p className="text-gray-500 text-sm">注文履歴はまだありません</p>
        <p className="text-gray-400 text-xs mt-1 mb-6">
          注文後にこのページで履歴を確認できます
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-medium text-orange-600 hover:text-orange-700 underline underline-offset-2"
        >
          トップページへ
        </Link>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const date = new Date(entry.createdAt)
        const dateStr = date.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Tokyo',
        })
        const timeStr = date.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Tokyo',
        })

        return (
          <li key={entry.id}>
            <Link
              href={`/orders/${entry.id}`}
              className="flex items-center justify-between bg-white rounded-xl shadow-sm px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="space-y-0.5">
                <p className="font-semibold text-gray-900 text-sm">{entry.storeName}</p>
                <time className="text-xs text-gray-400" dateTime={entry.createdAt}>
                  #{entry.orderNumber} · {dateStr} {timeStr}
                </time>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900 text-sm">
                  ¥{entry.totalAmount.toLocaleString()}
                </p>
                <span className="text-xs text-gray-400 mt-0.5 block" aria-hidden="true">→</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
