import { ImageResponse } from 'next/og'
import { createServiceClient } from '@/lib/supabase-server'

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
    .select('name, cover_url, area, cuisine_type')
    .eq('slug', slug)
    .single()

  // カバー画像がある場合はそのまま表示
  if (store?.cover_url) {
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
          {/* OG image generator では next/image が使えないため標準 img タグを使用 */}
          <img
            src={store.cover_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* オーバーレイ */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 200,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '0 48px 36px',
              fontFamily: 'sans-serif',
            }}
          >
            <div style={{ fontSize: 48, fontWeight: 700, color: 'white' }}>
              {store.name}
            </div>
            <div style={{ fontSize: 24, color: '#fb923c', marginTop: 8 }}>
              mocal — Pre-order Pickup
            </div>
          </div>
        </div>
      ),
      { ...size },
    )
  }

  // カバー画像なし → ブランデッドフォールバック
  const storeName = store?.name ?? slug
  const subtitle = [store?.cuisine_type, store?.area].filter(Boolean).join(' · ')

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
        <div style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
          mocal
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: 'white',
            marginTop: 20,
            textAlign: 'center',
            padding: '0 80px',
          }}
        >
          {storeName}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 30, color: '#fed7aa', marginTop: 16 }}>
            {subtitle}
          </div>
        ) : null}
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)', marginTop: 40 }}>
          Scan QR · Pre-order · Zero Wait
        </div>
      </div>
    ),
    { ...size },
  )
}
