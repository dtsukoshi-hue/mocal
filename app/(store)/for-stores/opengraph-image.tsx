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
          background: '#1c1917', // stone-900
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: fontData ? 'NotoSansJP, sans-serif' : 'sans-serif',
        }}
      >
        {/* 対象読者タグ */}
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#f97316',
            letterSpacing: '4px',
            marginBottom: 28,
          }}
        >
          飲食店オーナー様へ
        </div>

        {/* ブランド */}
        <div
          style={{
            display: 'flex',
            fontSize: 100,
            fontWeight: 700,
            letterSpacing: '-3px',
            color: 'white',
          }}
        >
          mo
          <span style={{ color: '#f97316' }}>cal</span>
        </div>

        {/* メインコピー */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#d6d3d1', // stone-300
            marginTop: 24,
            textAlign: 'center',
          }}
        >
          ポスレジ不要・即日導入。
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#d6d3d1',
            marginTop: 8,
          }}
        >
          顧客手数料ゼロのテイクアウト事前注文。
        </div>

        {/* 料金バッジ */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            marginTop: 44,
          }}
        >
          {['初期費用 ¥0', '月額固定費 ¥0', '手数料 10%のみ'].map((label) => (
            <div
              key={label}
              style={{
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.4)',
                borderRadius: 12,
                padding: '10px 22px',
                fontSize: 22,
                fontWeight: 700,
                color: '#fb923c', // orange-400
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontOptions,
    },
  )
}
