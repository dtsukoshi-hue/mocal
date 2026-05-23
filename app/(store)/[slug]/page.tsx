import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import {
  getCachedStore,
  getCachedStoreMeta,
  getCachedMenuItems,
  getCachedStoreHours,
  getCachedCombos,
} from '@/lib/store-cache'
import MenuView from './_components/MenuView'

interface Props {
  params: Promise<{ slug: string }>
}

// generateMetadata は use cache 済みの getCachedStoreMeta を呼ぶため
// メタデータ自体もキャッシュエントリを共有する
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const store = await getCachedStoreMeta(slug)

  if (!store) return { title: '店舗が見つかりません | mocal' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const title = `${store.name} | mocal`
  const parts = [
    store.cuisine_type,
    store.area ? `${store.area}エリア` : null,
    'テイクアウト事前注文',
  ].filter(Boolean)
  const description =
    store.description ??
    `${store.name}（${parts.join(' · ')}）。行列なし・待ち時間なしでスムーズに受け取れます。`

  const ogImages = store.cover_url
    ? [{ url: store.cover_url, width: 1200, height: 630, alt: store.name }]
    : undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/${slug}`,
      siteName: 'mocal',
      type: 'website',
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: store.cover_url ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(store.cover_url ? { images: [store.cover_url] } : {}),
    },
  }
}

// デフォルトエクスポートは dynamic（404 チェックのため per-request）。
// force-dynamic は cacheComponents モードでは不要。
export default async function StorePage({ params }: Props) {
  const { slug } = await params
  // use cache → キャッシュヒット時はメモリから提供（1000 店舗でも DB 負荷なし）
  const store = await getCachedStore(slug)
  if (!store) notFound()

  return (
    <>
      
      <Suspense fallback={null}>
        <StoreJsonLd store={store} slug={slug} />
      </Suspense>
      {/* Cached island: RSC ペイロードを store:storeId タグでキャッシュ */}
      <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
        <CachedMenuContent store={store} />
      </Suspense>
    </>
  )
}

// ---------------------------------------------------------------------------
// JSON-LD 構造化データ（非実行スクリプト = CSP nonce 不要）
// ---------------------------------------------------------------------------
async function StoreJsonLd({
  store,
  slug,
}: {
  store: NonNullable<Awaited<ReturnType<typeof getCachedStore>>>
  slug: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

  // JSON-LD 構造化データ（FoodEstablishment スキーマ）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    name: store.name,
    ...(store.description ? { description: store.description } : {}),
    ...(store.cuisine_type ? { servesCuisine: store.cuisine_type } : {}),
    ...(store.area ? { areaServed: store.area } : {}),
    url: `${appUrl}/${slug}`,
    ...(store.cover_url ? { image: store.cover_url } : {}),
    potentialAction: {
      '@type': 'OrderAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${appUrl}/${slug}`,
        inLanguage: 'ja',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        // JSON.stringify は '<' '>' '&' を素通しにするため HTML パーサーが
        // </script> タグと誤認しないよう Unicode エスケープする
        __html: JSON.stringify(jsonLd)
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Cached island — RSC ペイロードを store:storeId タグでキャッシュ
// store データは親からシリアライズ可能な plain object として受け取る
// ---------------------------------------------------------------------------
async function CachedMenuContent({
  store,
}: {
  store: NonNullable<Awaited<ReturnType<typeof getCachedStore>>>
}) {
  const [menuItems, storeHours, combos] = await Promise.all([
    getCachedMenuItems(store.id),
    getCachedStoreHours(store.id),
    getCachedCombos(store.id),
  ])

  return <MenuView store={store} menuItems={menuItems} storeHours={storeHours} combos={combos} />
}
