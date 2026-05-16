/**
 * 公開店舗データのサーバーサイドキャッシュ（server-only）
 *
 * `use cache` ディレクティブを使用するため、このモジュールはサーバー専用です。
 * クライアントコンポーネントから直接インポートしないでください。
 *
 * cacheComponents: true（PPR モード）における設計:
 * - 各関数に `use cache` を付与することで、RSC ペイロード・HTML をキャッシュ。
 * - `cacheTag` で storeId / slug ベースのタグを設定し、管理者操作時に
 *   `revalidateTag` で即時パージできるようにしている。
 * - 1000 店舗規模では全リクエストで React ツリーを再レンダリングする必要がなく、
 *   キャッシュヒット時はメモリから RSC ペイロードを返す。
 */
import { cacheLife, cacheTag } from 'next/cache'
import { createServiceClient } from './supabase-server'

// ---------------------------------------------------------------------------
// 店舗データ（minutes TTL — stale: 5m, revalidate: 1m, expire: 1h）
// ---------------------------------------------------------------------------
export async function getCachedStore(slug: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag(`store-slug:${slug}`)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('stores')
    .select(
      'id, name, description, is_open, wait_minutes, logo_url, cover_url, area, cuisine_type',
    )
    .eq('slug', slug)
    .single()

  // storeId タグも付与（storeId ベースの一括パージに対応）
  if (data) cacheTag(`store:${data.id}`)
  return data ?? null
}

// ---------------------------------------------------------------------------
// generateMetadata 用（SEO フィールドも含む）
// ---------------------------------------------------------------------------
export async function getCachedStoreMeta(slug: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag(`store-slug:${slug}`)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('stores')
    .select('id, name, description, area, cuisine_type, cover_url')
    .eq('slug', slug)
    .single()

  if (data) cacheTag(`store:${data.id}`)
  return data ?? null
}

// ---------------------------------------------------------------------------
// メニューアイテム（minutes TTL）
// ---------------------------------------------------------------------------
export async function getCachedMenuItems(storeId: string) {
  'use cache'
  cacheLife('minutes')
  cacheTag(`store:${storeId}`)

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
}

// ---------------------------------------------------------------------------
// 営業時間（hours TTL — 頻繁に変わらない）
// ---------------------------------------------------------------------------
export async function getCachedStoreHours(storeId: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`store:${storeId}`)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('store_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('store_id', storeId)
    .order('day_of_week')

  return data ?? []
}
