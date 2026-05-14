import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal-iota.vercel.app'

export const metadata: Metadata = {
  title: {
    default: 'mocal — テイクアウト事前注文',
    template: '%s | mocal',
  },
  description: '待たずに受け取れるテイクアウト事前注文。お気に入りのお店をスマホで注文、準備完了を通知でお知らせ。',
  metadataBase: new URL(APP_URL),
  openGraph: {
    siteName: 'mocal',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    site: '@mocal_jp',
  },
  // 管理画面は子レイアウトで上書きして noindex 化する
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* スクリーンリーダー / キーボード操作向け: メインコンテンツへのスキップリンク */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-gray-900 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
        >
          メインコンテンツへスキップ
        </a>
        {children}
      </body>
    </html>
  );
}
