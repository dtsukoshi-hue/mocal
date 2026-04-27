import Link from 'next/link'
import OrderHistoryView from './_components/OrderHistoryView'

// 顧客向け注文履歴ページ
// このブラウザの localStorage に保存された注文 ID のみを表示する。
// （order_number 検索は列挙攻撃を避けるため提供しない）
export default function OrderHistoryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            ホーム
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <OrderHistoryView />
      </main>
    </div>
  )
}
