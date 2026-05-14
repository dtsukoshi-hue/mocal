import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

// 60秒ごとに再生成（store_hours の変更に追従）
export const revalidate = 60

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal-iota.vercel.app'

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: stores } = await supabase
    .from('stores')
    .select('id')
    .order('created_at', { ascending: true })

  const storeUrls: MetadataRoute.Sitemap = (stores ?? []).map((s) => ({
    url: `${appUrl}/${s.id}`,
    changeFrequency: 'daily',
    priority: 0.8,
    lastModified: new Date(),
  }))

  return [
    {
      url: appUrl,
      changeFrequency: 'hourly',
      priority: 1.0,
      lastModified: new Date(),
    },
    {
      url: `${appUrl}/orders`,
      changeFrequency: 'never',
      priority: 0.3,
    },
    {
      url: `${appUrl}/mypage`,
      changeFrequency: 'never',
      priority: 0.2,
    },
    {
      url: `${appUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${appUrl}/terms`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${appUrl}/tokushoho`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    ...storeUrls,
  ]
}
