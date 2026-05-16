import Link from 'next/link'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import type { Metadata } from 'next'

// force-dynamic は不要（cacheComponents モードでは nonce アイランドを Suspense で囲む）

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

export const metadata: Metadata = {
  title: 'mocal — テイクアウト事前注文プラットフォーム',
  description:
    '公園・お出かけ先での食事をもっと気軽に。QRコードで即注文、アプリ不要、待ち時間ゼロ。' +
    '飲食店向けテイクアウト事前注文プラットフォーム。',
  openGraph: {
    title: 'mocal — テイクアウト事前注文プラットフォーム',
    description:
      '公園・お出かけ先での食事をもっと気軽に。QRコードで即注文、アプリ不要、待ち時間ゼロ。',
    url: APP_URL,
    type: 'website',
    locale: 'ja_JP',
    siteName: 'mocal',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mocal — テイクアウト事前注文プラットフォーム',
    description:
      '公園・お出かけ先での食事をもっと気軽に。QRコードで即注文、アプリ不要、待ち時間ゼロ。',
  },
  alternates: {
    canonical: APP_URL,
  },
}

// 同期関数に変更（headers は Suspense 内の HomepageJsonLd で呼ぶ）
export default function HomePage() {
  return (
    <>
      {/* Dynamic island: nonce は per-request で生成 */}
      <Suspense fallback={null}>
        <HomepageJsonLd />
      </Suspense>
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
    </>
  )
}

// ---------------------------------------------------------------------------
// Dynamic island — headers() を使うため Suspense 内で動的実行される
// ---------------------------------------------------------------------------
async function HomepageJsonLd() {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  // JSON-LD 構造化データ（WebSite + Organization）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${APP_URL}/#website`,
        name: 'mocal',
        url: APP_URL,
        description: 'テイクアウト事前注文プラットフォーム',
        inLanguage: 'ja',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${APP_URL}/{slug}`,
          },
          'query-input': 'required name=slug',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${APP_URL}/#organization`,
        name: 'mocal',
        url: APP_URL,
        email: 'support@mocal.jp',
        sameAs: [`${APP_URL}/for-stores`],
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd)
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      }}
    />
  )
}
