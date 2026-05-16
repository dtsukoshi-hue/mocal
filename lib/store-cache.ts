/**
 * 公開店舗データのサーバーサイドキャッシュ
 *
 * `unstable_cache` を用いてページが force-dynamic であっても
 * Supabase クエリ結果をプロセス内メモリにキャッシュする。
 *
 * - 1000 ユーザーが同一店舗にアクセスしても DB へのクエリは TTL の間 1 回だけ。
 * - 管理者がメニュー・店舗情報を更新したとき revalidatePath / revalidateTag で
 *   即時パージされるため、表示遅延は最大 1 リクエスト分のみ。
 */
import { unstable_cache } from 'next/cache'
import { createServiceClient } from './supabase-server'

// ---------------------------------------------------------------------------
// 店舗データ（60 秒 TTL）
// ---------------------------------------------------------------------------
export const getCachedStore = unstable_cache(
  async (slug: string) => {
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
  ['store-by-slug'],
  { revalidate: 60 },
)

// generateMetadata 用（SEO フィールドも含む）
export const getCachedStoreMeta = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('stores')
      .select('name, description, area, cuisine_type, cover_url')
      .eq('slug', slug)
      .single()
    return data ?? null
  },
  ['store-meta-by-slug'],
  { revalidate: 60 },
)

// ---------------------------------------------------------------------------
// メニューアイテム（60 秒 TTL）
// ---------------------------------------------------------------------------
export const getCachedMenuItems = unstable_cache(
  async (storeId: string) => {
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
  ['store-menu-items'],
  { revalidate: 60 },
)

// ---------------------------------------------------------------------------
// 営業時間（1 時間 TTL — 頻繁に変わらない）
// ---------------------------------------------------------------------------
export const getCachedStoreHours = unstable_cache(
  async (storeId: string) => {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('store_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('store_id', storeId)
      .order('day_of_week')
    return data ?? []
  },
  ['store-hours'],
  { revalidate: 3600 },
)
