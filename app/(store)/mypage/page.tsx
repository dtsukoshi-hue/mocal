import Link from 'next/link'
import CustomerBottomNav from '../_components/CustomerBottomNav'
import NotificationPanel from './_components/NotificationPanel'

export const metadata = {
  title: 'マイページ',
}

export default function MyPage() {
  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">マイページ</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ゲストユーザー案内 */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center space-y-3">
          <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center text-2xl">
            👤
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">ゲストユーザー</p>
            <p className="text-xs text-gray-500 mt-1">
              ログイン機能は準備中です
            </p>
          </div>
        </section>

        {/* メニュー */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          <RowLink href="/orders" label="注文履歴" icon="📋" />
          <RowDisabled label="プロフィール編集" icon="✏️" hint="準備中" />
          <RowDisabled label="支払い方法" icon="💳" hint="準備中" />
        </section>

        {/* 通知設定 */}
        <NotificationPanel />

        {/* サポート */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 pt-3 pb-1">
            サポート
          </p>
          <RowDisabled label="よくある質問" icon="❓" hint="準備中" />
          <RowDisabled label="プライバシーポリシー" icon="🔒" hint="準備中" />
          <RowDisabled label="特定商取引法" icon="📜" hint="準備中" />
        </section>

        <p className="text-xs text-gray-400 text-center pt-2">
          mocal — テイクアウト事前注文プラットフォーム
        </p>
      </main>

      <CustomerBottomNav />
    </div>
  )
}

function RowLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-sm text-gray-900">{label}</span>
      <span className="text-gray-300">›</span>
    </Link>
  )
}

function RowDisabled({ label, icon, hint }: { label: string; icon: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-lg opacity-40">{icon}</span>
      <span className="flex-1 text-sm text-gray-400">{label}</span>
      <span className="text-xs text-gray-300">{hint}</span>
    </div>
  )
}
