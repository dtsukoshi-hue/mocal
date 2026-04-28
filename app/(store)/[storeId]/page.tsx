import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import MenuView from './_components/MenuView'

// 店舗ページは内容更新の頻度が低い（メニュー・営業時間）ので 60s キャッシュ。
// 営業中フラグの即時反映が必要な場合はメニュー画面の Realtime チャネルで購読する想定。
export const revalidate = 60

interface Props {
  params: Promise<{ storeId: string }>
}

export default async function StorePage({ params }: Props) {
  const { storeId } = await params

  // UUID 形式チェック
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(storeId)) notFound()

  // 店舗・メニューは公開データ（RLS: USING(true)）なので anon key で参照
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 店舗情報取得
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, is_open, wait_minutes')
    .eq('id', storeId)
    .single()

  if (!store) notFound()

  // メニュー取得（提供可能なもののみ）
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, price, category, emoji, image_url, is_available, sort_order')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .order('sort_order')

  return (
    <MenuView store={store} menuItems={menuItems ?? []} />
  )
}
