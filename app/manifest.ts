import type { MetadataRoute } from 'next'

// PWA マニフェスト
// 顧客が店舗ページをホーム画面に追加して再訪しやすくする。
// アイコンは将来差し替え（現状は favicon を流用）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mocal — テイクアウト事前注文',
    short_name: 'mocal',
    description: '近くのお店に並ばず・待たず・スマホで事前注文。受取番号で受け取るだけ。',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f5f4',
    theme_color: '#b45309',
    lang: 'ja',
    categories: ['food', 'shopping'],
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
        purpose: 'any',
      },
    ],
  }
}
