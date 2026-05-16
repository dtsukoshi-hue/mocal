import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getCachedStore, getCachedStoreMeta, getCachedMenuItems, getCachedStoreHours } from '@/lib/store-cache'
import MenuView from './_components/MenuView'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // キャッシュ済みクエリを使用（generateMetadata と StorePage で同じエントリを共有）
  const store = await getCachedStoreMeta(slug)

  if (!store) return { title: '店舗が見つかりません | mocal' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const title = `${store.name} | mocal`
  const parts = [
    store.cuisine_type,
    store.area ? `${store.area}エリア` : null,
    'テイクアウト事前注文',
  ].filter(Boolean)
  const description = store.description
    ?? `${store.name}（${parts.join(' · ')}）。行列なし・待ち時間なしでスムーズに受け取れます。`

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

export default async function StorePage({ params }: Props) {
  const { slug } = await params
  const nonce = (await headers()).get('x-nonce') ?? undefined

  // キャッシュ済みクエリ（force-dynamic でもプロセス内メモリから提供）
  const store = await getCachedStore(slug)
  if (!store) notFound()

  const [menuItems, storeHours] = await Promise.all([
    getCachedMenuItems(store.id),
    getCachedStoreHours(store.id),
  ])

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
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          // JSON.stringify は '<' '>' '&' を素通しにするため HTML パーサーが
          // </script> タグと誤認しないよう Unicode エスケープする
          __html: JSON.stringify(jsonLd)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026'),
        }}
      />
      <MenuView store={store} menuItems={menuItems} storeHours={storeHours} />
    </>
  )
}
