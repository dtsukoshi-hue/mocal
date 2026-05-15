import type { Metadata } from 'next'
import OrderHistorySection from './_components/OrderHistorySection'

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

      <main id="main-content" className="max-w-lg mx-auto px-4 py-6">
        <OrderHistorySection />
      </main>
    </div>
  )
}
