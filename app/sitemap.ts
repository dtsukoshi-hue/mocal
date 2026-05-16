import type { MetadataRoute } from 'next'
import { cacheLife } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  'use cache'
  cacheLife('days')

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

  // 公開中の店舗ページを動的に追加
  try {
    const supabase = createServiceClient()
    const { data: stores } = await supabase
      .from('stores')
      .select('slug, created_at')
      .eq('is_open', true)
      .not('slug', 'is', null)

    const storeRoutes: MetadataRoute.Sitemap = (stores ?? [])
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
