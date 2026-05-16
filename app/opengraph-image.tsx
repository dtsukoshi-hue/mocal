import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// 注意: 日本語フォントの動的ロードは Turbopack (Next.js 16) と非互換のため
// ASCII / システムフォントで描画する。日本語テキストは画像非依存の meta タグで提供。
export default function Image() {
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
          fontFamily: 'sans-serif',
        }}
      >
        {/* ブランドロゴ */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: 'white',
            letterSpacing: '-6px',
            display: 'flex',
          }}
        >
          mocal
        </div>

        {/* タグライン */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#fff7ed',
            marginTop: 24,
            letterSpacing: '1px',
          }}
        >
          Takeout Pre-ordering Platform
        </div>

        {/* 価値提案 */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginTop: 56,
            fontSize: 24,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          <span>Scan QR</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>No App Needed</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Zero Wait</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
