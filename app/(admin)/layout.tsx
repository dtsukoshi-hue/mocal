import type { Metadata } from 'next'

// /admin/* 配下は検索エンジンにインデックス化させない
// （ログイン画面・管理画面が公開検索結果に出ると攻撃面が広がるため）
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
