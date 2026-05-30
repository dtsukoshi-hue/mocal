import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'

const getStoreSlugs = unstable_cache(
  async () => {
    const supabase = createServiceClient()
    // 公開フィルタ (docs/payment-design-legal.md L2):
    //   - is_open=true かつ stripe_account_id IS NOT NULL の店舗のみ sitemap に載せる
    //   - Connect 未完了店舗を sitemap 経由で公開しない
    const { data } = await supabase
      .from('stores')
      .select('slug, created_at')
      .eq('is_open', true)
      .not('slug', 'is', null)
      .not('stripe_account_id', 'is', null)
    return data ?? []
  },
  ['sitemap-stores'],
  { revalidate: 86400 }, // 24h
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${appUrl}/for-stores`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${appUrl}/onboarding`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${appUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${appUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${appUrl}/tokushoho`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  // 公開中の店舗ページを動的に追加（24h キャッシュ）
  try {
    const stores = await getStoreSlugs()
    const storeRoutes: MetadataRoute.Sitemap = stores
      .filter(s => s.slug)
      .map(s => ({
        url: `${appUrl}/${s.slug}`,
        lastModified: new Date(s.created_at),
        changeFrequency: 'daily' as const,
        priority: 0.8,
      }))

    return [...staticRoutes, ...storeRoutes]
  } catch {
    return staticRoutes
  }
}
