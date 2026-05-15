import { ImageResponse } from 'next/og'
import { createServiceClient } from '@/lib/supabase-server'
import { loadNotoSansJPBold } from '@/lib/og-font'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function Image({ params }: Props) {
  const { slug } = await params

  const supabase = createServiceClient()
  const { data: store } = await supabase
    .from('stores')
    .select('name, description, cover_url, logo_url, area, cuisine_type')
    .eq('slug', slug)
    .single()

  // カバー画像がある場合はそのまま使用（nativeな画像の方が高品質）
  if (store?.cover_url) {
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
            display: 'flex',
            position: 'relative',
          }}
        >
          {/* カバー画像 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={store.cover_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* 下部グラデーションオーバーレイ */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 220,
              background: 'rgba(0,0,0,0.62)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '0 48px 40px',
              fontFamily: fontData ? 'NotoSansJP, sans-serif' : 'sans-serif',
            }}
          >
            <div style={{ fontSize: 52, fontWeight: 700, color: 'white' }}>
              {store.name}
            </div>
            {(store.area || store.cuisine_type) && (
              <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.75)', marginTop: 8 }}>
                {[store.cuisine_type, store.area ? `${store.area}エリア` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            <div
              style={{
                fontSize: 22,
                color: '#fb923c',
                marginTop: 6,
                fontWeight: 700,
              }}
            >
              mocal でテイクアウト事前注文
            </div>
          </div>
        </div>
      ),
      {
        ...size,
        fonts: fontOptions,
      },
    )
  }

  // カバー画像なし → ブランデッドフォールバック
  const fontData = await loadNotoSansJPBold()
  const fontOptions = fontData
    ? [{ name: 'NotoSansJP', data: fontData, weight: 700 as const }]
    : []

  const storeName = store?.name ?? slug
  const subtitle = [store?.cuisine_type, store?.area ? `${store.area}エリア` : null]
    .filter(Boolean)
    .join(' · ')

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
        {/* mocal ロゴ（小） */}
        <div style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
          mocal
        </div>

        {/* 店舗名 */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: 'white',
            marginTop: 24,
            textAlign: 'center',
            padding: '0 80px',
            lineHeight: 1.2,
          }}
        >
          {storeName}
        </div>

        {/* エリア · ジャンル */}
        {subtitle && (
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: '#fed7aa',
              marginTop: 20,
            }}
          >
            {subtitle}
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.75)',
            marginTop: 44,
          }}
        >
          QRコードで即注文 · 待ち時間ゼロ
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontOptions,
    },
  )
}
