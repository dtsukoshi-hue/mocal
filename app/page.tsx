import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* ロゴ */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            mo<span className="text-orange-500">cal</span>
          </h1>
          <p className="mt-2 text-gray-500 text-sm">テイクアウト事前注文プラットフォーム</p>
        </div>

        {/* 説明文 */}
        <div className="max-w-sm mb-10 text-sm text-gray-600 space-y-2 leading-relaxed">
          <p>
            お気に入りのお店の QR コードを読み取るか、<br />
            お店から共有された URL からご注文ください。
          </p>
          <p className="text-gray-400 text-xs">
            アプリ不要・事前決済・準備完了通知
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/onboarding"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-8 py-3 text-sm transition-colors"
          >
            店舗として登録する
          </Link>
          <Link
            href="/admin/login"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            店舗ログイン
          </Link>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-gray-400 space-x-4">
        <Link href="/privacy" className="hover:text-gray-600">プライバシーポリシー</Link>
        <Link href="/tokushoho" className="hover:text-gray-600">特定商取引法に基づく表示</Link>
      </footer>
    </div>
  )
}
