import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import SwRegister from './_components/SwRegister'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'mocal — テイクアウト事前注文',
    template: '%s | mocal',
  },
  description: '公園・お出かけ先での食事をもっと気軽に。飲食店向けテイクアウト事前注文プラットフォーム。',
  applicationName: 'mocal',
  keywords: ['テイクアウト', '事前注文', 'モバイルオーダー', '飲食店'],
  authors: [{ name: 'Entrust合同会社' }],
  openGraph: {
    siteName: 'mocal',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    site: '@mocal_jp',
  },
  // Pilot 開始前は全 page noindex/nofollow (Google 検索結果露出防止)
  // Pilot 開始時に { index: true, follow: true } に戻す (backlog 参照)
  robots: {
    index: false,
    follow: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main-content" className="skip-link">メインコンテンツへスキップ</a>
        <SwRegister />
        {children}
      </body>
    </html>
  )
}
