import Link from 'next/link'

// nonce-based CSP（proxy.ts）が機能するよう動的レンダリングを強制
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main id="main-content" className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* ロゴ */}
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight">
            mo<span className="text-orange-500">cal</span>
          </h1>
          <p className="mt-3 text-gray-500 text-sm">テイクアウト事前注文プラットフォーム</p>
        </div>

        {/* バリュープロポジション */}
        <div className="w-full max-w-xs mb-10 space-y-2">
          <div className="flex items-center gap-3 text-left bg-orange-50 rounded-xl px-4 py-3">
            <div className="w-1 h-8 bg-orange-400 rounded-full shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-gray-800">QR コードで即注文</p>
              <p className="text-xs text-gray-500 mt-0.5">お店の QR を読み取るだけ。アプリ不要。</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left bg-orange-50 rounded-xl px-4 py-3">
            <div className="w-1 h-8 bg-orange-400 rounded-full shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-gray-800">待ち時間ゼロ</p>
              <p className="text-xs text-gray-500 mt-0.5">事前決済で受取時間を短縮。</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-left bg-orange-50 rounded-xl px-4 py-3">
            <div className="w-1 h-8 bg-orange-400 rounded-full shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-gray-800">準備完了を通知</p>
              <p className="text-xs text-gray-500 mt-0.5">できあがったらプッシュ通知でお知らせ。</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          <Link
            href="/onboarding"
            className="w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-6 py-3.5 text-sm transition-colors"
          >
            店舗として登録する<span aria-hidden="true"> →</span>
          </Link>
          <Link
            href="/admin/login"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            すでに登録済みの方はこちら
          </Link>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-gray-400 space-x-4">
        <Link href="/for-stores" className="hover:text-gray-600">店舗オーナー様へ</Link>
        <Link href="/privacy" className="hover:text-gray-600">プライバシーポリシー</Link>
        <Link href="/tokushoho" className="hover:text-gray-600">特定商取引法に基づく表示</Link>
      </footer>
    </div>
  )
}
