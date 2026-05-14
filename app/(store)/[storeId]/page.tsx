import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { Metadata } from 'next'
import { isUuid } from '@/lib/validation'
import MenuView from './_components/MenuView'

// 店舗ページは内容更新の頻度が低い（メニュー・営業時間）ので 60s キャッシュ。
// 営業中フラグの即時反映が必要な場合はメニュー画面の Realtime チャネルで購読する想定。
export const revalidate = 60

interface Props {
  params: Promise<{ storeId: string }>
}

function makeSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeId } = await params
  if (!isUuid(storeId)) return {}

  const { data: store } = await makeSupabase()
    .from('stores')
    .select('name, cuisine_type, area, cover_url')
    .eq('id', storeId)
    .single()

  if (!store) return {}

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal-iota.vercel.app'
  const title = `${store.name} — テイクアウト注文`
  const description = [
    store.cuisine_type,
    store.area ? `${store.area}エリア` : null,
    'mocal でテイクアウト事前注文',
  ].filter(Boolean).join(' · ')

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appUrl}/${storeId}`,
      ...(store.cover_url ? { images: [{ url: store.cover_url, width: 1200, height: 630 }] } : {}),
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
  const { storeId } = await params

  // UUID 形式チェック
  if (!isUuid(storeId)) notFound()

  // 店舗・メニューは公開データ（RLS: USING(true)）なので anon key で参照
  const supabase = makeSupabase()

  // 店舗情報取得
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, is_open, wait_minutes, logo_url, cover_url')
    .eq('id', storeId)
    .single()

  if (!store) notFound()

  // メニューとコンボは独立しているので並列取得
  const [{ data: menuItems }, { data: combos }] = await Promise.all([
    supabase
      .from('menu_items')
      .select('id, name, price, description, category, emoji, image_url, is_available, sort_order')
      .eq('store_id', storeId)
      .eq('is_available', true)
      .order('sort_order'),
    supabase
      .from('combo_offers')
      .select('id, name, description, price_delta, emoji, is_available, sort_order')
      .eq('store_id', storeId)
      .eq('is_available', true)
      .order('sort_order'),
  ])

  // コンボ ID ごとに含まれるアイテムをまとめる
  type ComboWithItems = NonNullable<typeof combos>[number] & {
    items: { menu_item_id: string; qty: number }[]
  }
  const comboIds = (combos ?? []).map((c) => c.id)
  const comboItemsByCombo = new Map<string, { menu_item_id: string; qty: number }[]>()

  if (comboIds.length > 0) {
    const { data: comboItems } = await supabase
      .from('combo_offer_items')
      .select('combo_id, menu_item_id, qty')
      .in('combo_id', comboIds)

    for (const ci of comboItems ?? []) {
      const arr = comboItemsByCombo.get(ci.combo_id) ?? []
      arr.push({ menu_item_id: ci.menu_item_id, qty: ci.qty })
      comboItemsByCombo.set(ci.combo_id, arr)
    }
  }

  const combosWithItems: ComboWithItems[] = (combos ?? []).map((c) => ({
    ...c,
    items: comboItemsByCombo.get(c.id) ?? [],
  }))

  return (
    <MenuView store={store} menuItems={menuItems ?? []} combos={combosWithItems} />
  )
}
