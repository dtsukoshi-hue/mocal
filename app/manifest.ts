import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mocal — テイクアウト事前注文',
    short_name: 'mocal',
    description: '公園・お出かけ先での食事をもっと気軽に',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#f97316',
    icons: [
      {
        src: '/api/icons/192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/api/icons/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
