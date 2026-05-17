/**
 * 公開店舗データのサーバーサイドキャッシュ（server-only）
 *
 * `unstable_cache` を使用してデータ層でキャッシュする。
 * キャッシュタグは `revalidateTag` で即時パージできるよう設計している。
 *
 * TTL:
 * - store / meta / menu: 60s（受付状態・メニューは頻繁に変わりうる）
 * - hours:               3600s（営業時間は滅多に変わらない）
 *
 * タグ設計（revalidateStore と一致させること）:
 * - store-slug:{slug}  → getCachedStore, getCachedStoreMeta
 * - store:{storeId}    → getCachedMenuItems, getCachedStoreHours
 *
 * 管理者アクション（app/actions/store.ts, menu.ts）は
 * revalidateTag('store:{storeId}') と revalidateTag('store-slug:{slug}') を
 * 両方呼び出すことで全キャッシュをパージする。
 */
import { unstable_cache } from 'next/cache'
import { createServiceClient } from './supabase-server'

// ---------------------------------------------------------------------------
// 店舗データ（60s TTL）— slug ベースで取得
// ---------------------------------------------------------------------------
export async function getCachedStore(slug: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('stores')
        .select(
          'id, name, description, is_open, wait_minutes, logo_url, cover_url, area, cuisine_type',
        )
        .eq('slug', slug)
        .single()
      return data ?? null
    },
    [`store:${slug}`],
    {
      revalidate: 60,
      tags: [`store-slug:${slug}`],
    },
  )()
}

// ---------------------------------------------------------------------------
// generateMetadata 用（SEO フィールドも含む）— 60s TTL
// ---------------------------------------------------------------------------
export async function getCachedStoreMeta(slug: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('stores')
        .select('id, name, description, area, cuisine_type, cover_url')
        .eq('slug', slug)
        .single()
      return data ?? null
    },
    [`store-meta:${slug}`],
    {
      revalidate: 60,
      tags: [`store-slug:${slug}`],
    },
  )()
}

// ---------------------------------------------------------------------------
// メニューアイテム（60s TTL）— storeId ベースで取得
// ---------------------------------------------------------------------------
export async function getCachedMenuItems(storeId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('menu_items')
        .select(
          'id, name, description, price, category, emoji, image_url, is_available, sort_order',
        )
        .eq('store_id', storeId)
        .eq('is_available', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      return data ?? []
    },
    [`menu-items:${storeId}`],
    {
      revalidate: 60,
      tags: [`store:${storeId}`],
    },
  )()
}

// ---------------------------------------------------------------------------
// 営業時間（3600s TTL）— storeId ベースで取得
// ---------------------------------------------------------------------------
export async function getCachedStoreHours(storeId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('store_hours')
        .select('weekday, open_time, close_time, is_open, last_order')
        .eq('store_id', storeId)
        .order('weekday')
      return data ?? []
    },
    [`store-hours:${storeId}`],
    {
      revalidate: 3600,
      tags: [`store:${storeId}`],
    },
  )()
}
