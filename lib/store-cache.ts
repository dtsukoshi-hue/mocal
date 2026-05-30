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
import type { Store, StoreHour } from './database.aliases'

// DB の CHECK 制約 (wait_minutes IN (10,15,20,30,40,60) / weekday 0..6) が
// auto-generated 型の number を narrow union (WaitMinutes / Weekday) と等価に保証する。
// supabase gen types は CHECK を読まないため、ここで境界で cast する。
type StoreRow = Pick<Store, 'id' | 'name' | 'description' | 'is_open' | 'wait_minutes' | 'logo_url' | 'cover_url' | 'area' | 'cuisine_type' | 'tokushoho_url' | 'allergen_url'>
type StoreMetaRow = Pick<Store, 'id' | 'name' | 'description' | 'area' | 'cuisine_type' | 'cover_url'>
type StoreHourRow = Pick<StoreHour, 'weekday' | 'open_time' | 'close_time' | 'is_open' | 'last_order'>

// ---------------------------------------------------------------------------
// 店舗データ（60s TTL）— slug ベースで取得
//
// 公開フィルタ (docs/payment-design-legal.md L2):
//   - `stripe_account_id IS NULL` の店舗は **顧客に表示しない**
//   - Connect onboarding 未完了 = mocal が販売者として代金を預かる経路 = 違法経路
//   - L3 (lib/payment.ts throw) があれば最終的に決済不可だが、顧客に表示自体させない
// ---------------------------------------------------------------------------
export async function getCachedStore(slug: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('stores')
        .select(
          'id, name, description, is_open, wait_minutes, logo_url, cover_url, area, cuisine_type, tokushoho_url, allergen_url',
        )
        .eq('slug', slug)
        .not('stripe_account_id', 'is', null)
        .single()
      return (data as StoreRow | null) ?? null
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
      // 公開フィルタ: stripe_account_id IS NULL を除外 (docs/payment-design-legal.md L2)
      const { data } = await supabase
        .from('stores')
        .select('id, name, description, area, cuisine_type, cover_url')
        .eq('slug', slug)
        .not('stripe_account_id', 'is', null)
        .single()
      return (data as StoreMetaRow | null) ?? null
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
// コンボセット（60s TTL）— storeId ベースで取得
// recovery-plan Phase R-2 / R2-2 で復元
// ---------------------------------------------------------------------------
export async function getCachedCombos(storeId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data: offers } = await supabase
        .from('combo_offers')
        .select('id, name, description, price_delta, emoji, is_available, sort_order')
        .eq('store_id', storeId)
        .eq('is_available', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (!offers || offers.length === 0) return []

      const { data: items } = await supabase
        .from('combo_offer_items')
        .select('combo_id, menu_item_id, qty')
        .in('combo_id', offers.map(o => o.id))

      const itemsByCombo = new Map<string, { menu_item_id: string; qty: number }[]>()
      for (const i of items ?? []) {
        const arr = itemsByCombo.get(i.combo_id) ?? []
        arr.push({ menu_item_id: i.menu_item_id, qty: i.qty })
        itemsByCombo.set(i.combo_id, arr)
      }
      return offers.map(o => ({ ...o, items: itemsByCombo.get(o.id) ?? [] }))
    },
    [`combos:${storeId}`],
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
      return (data as StoreHourRow[] | null) ?? []
    },
    [`store-hours:${storeId}`],
    {
      revalidate: 3600,
      tags: [`store:${storeId}`],
    },
  )()
}
