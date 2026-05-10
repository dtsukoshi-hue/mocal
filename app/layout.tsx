import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import SwRegister from './_components/SwRegister'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'mocal — テイクアウト事前注文',
  description: '公園・お出かけ先での食事をもっと気軽に。飲食店向けテイクアウト事前注文プラットフォーム。',
  applicationName: 'mocal',
  keywords: ['テイクアウト', '事前注文', 'モバイルオーダー', '飲食店'],
  authors: [{ name: 'Entrust合同会社' }],
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
        <SwRegister />
        {children}
      </body>
    </html>
  )
}
