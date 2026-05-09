import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            mo<span className="text-orange-500">cal</span>
          </h1>
          <p className="mt-2 text-gray-500 text-sm">テイクアウト事前注文プラットフォーム</p>
        </div>

        <div className="max-w-sm space-y-4 text-sm text-gray-600">
          <p className="leading-relaxed">
            お気に入りのお店の QR コードを読み取るか、<br />
            お店から共有された URL からご注文ください。
          </p>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3">
          <Link
            href="/onboarding"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors"
          >
            店舗として登録する
          </Link>
          <Link
            href="/admin/login"
            className="text-sm text-gray-400 hover:text-gray-600"
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
