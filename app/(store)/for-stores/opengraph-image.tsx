import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1c1917',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        {/* サブヘッド */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#f97316',
            letterSpacing: '6px',
            marginBottom: 28,
          }}
        >
          FOR RESTAURANT OWNERS
        </div>

        {/* ブランド */}
        <div
          style={{
            fontSize: 108,
            fontWeight: 900,
            color: 'white',
            letterSpacing: '-4px',
            display: 'flex',
          }}
        >
          mo<span style={{ color: '#f97316' }}>cal</span>
        </div>

        {/* メインコピー */}
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: '#d6d3d1',
            marginTop: 28,
            textAlign: 'center',
          }}
        >
          No POS Required. Launch Today.
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#78716c',
            marginTop: 12,
          }}
        >
          Zero customer fees. 10% only from store revenue.
        </div>

        {/* バッジ */}
        <div style={{ display: 'flex', gap: 16, marginTop: 48 }}>
          {['Setup: Free', 'Monthly: Free', 'Commission: 10%'].map((label) => (
            <div
              key={label}
              style={{
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.35)',
                borderRadius: 12,
                padding: '10px 24px',
                fontSize: 22,
                fontWeight: 700,
                color: '#fb923c',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
