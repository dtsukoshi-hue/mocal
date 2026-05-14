import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

// localStorage はクライアント専用のため SSR 無効でインポート
const OrderHistoryList = dynamic(
  () => import('./_components/OrderHistoryList'),
  {
    ssr: false,
    // SSR 無効時のフォールバック（スケルトン）
    loading: () => (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl h-20 animate-pulse" />
        ))}
      </div>
    ),
  }
)

export const metadata: Metadata = {
  title: '注文履歴 | mocal',
  robots: { index: false },
}

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
          <p className="text-xs text-gray-400 mt-0.5">このデバイスでの注文一覧</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <OrderHistoryList />
      </main>
    </div>
  )
}
