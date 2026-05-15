import { ImageResponse } from 'next/og'
import { loadNotoSansJPBold } from '@/lib/og-font'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const fontData = await loadNotoSansJPBold()

  const fontOptions = fontData
    ? [{ name: 'NotoSansJP', data: fontData, weight: 700 as const }]
    : []

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#f97316',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: fontData ? 'NotoSansJP, sans-serif' : 'sans-serif',
        }}
      >
        {/* ロゴ */}
        <div
          style={{
            display: 'flex',
            fontSize: 112,
            fontWeight: 700,
            letterSpacing: '-4px',
            color: 'white',
          }}
        >
          mo
          <span style={{ color: '#fff7ed' }}>cal</span>
        </div>

        {/* タグライン */}
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: '#fed7aa',
            marginTop: 16,
          }}
        >
          テイクアウト事前注文プラットフォーム
        </div>

        {/* キービジュアル — 3つの価値提案 */}
        <div
          style={{
            display: 'flex',
            gap: 28,
            marginTop: 52,
            fontSize: 26,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          <span>QRコードで即注文</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>アプリ不要</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>待ち時間ゼロ</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontOptions,
    },
  )
}
