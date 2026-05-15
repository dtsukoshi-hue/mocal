'use client'

import dynamic from 'next/dynamic'

// ssr: false は Client Component 内でのみ使用可能（Next.js 16 制約）
const OrderHistoryList = dynamic(
  () => import('./OrderHistoryList'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3" aria-busy="true" aria-label="注文履歴を読み込み中">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl h-20 animate-pulse" />
        ))}
      </div>
    ),
  }
)

export default function OrderHistorySection() {
  return <OrderHistoryList />
}
