import type { MetadataRoute } from 'next'

// PWA マニフェスト
// 顧客が注文ステータス画面をホーム画面に追加して再訪しやすくする。
// アイコンは将来差し替え（現状は favicon を流用）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mocal',
    short_name: 'mocal',
    description: 'テイクアウト事前注文プラットフォーム',
    start_url: '/orders',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#f97316',
    lang: 'ja',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
