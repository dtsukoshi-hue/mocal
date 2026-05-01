import OrderHistoryView from './_components/OrderHistoryView'
import CustomerBottomNav from '../_components/CustomerBottomNav'

// 顧客向け注文履歴ページ
// このブラウザの localStorage に保存された注文 ID のみを表示する。
// （order_number 検索は列挙攻撃を避けるため提供しない）
export default function OrderHistoryPage() {
  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-lg mx-auto px-4 py-6">
        <OrderHistoryView />
      </main>

      <CustomerBottomNav />
    </div>
  )
}
