import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import StoreDiscoveryView from './(store)/_components/StoreDiscoveryView'
import CustomerBottomNav from './(store)/_components/CustomerBottomNav'

// 店舗一覧は更新頻度が低いので 60s ISR
export const revalidate = 60

export default async function Home() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 公開ポリシー stores_public_read で anon でも一覧取得可能
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, is_open, wait_minutes, area, cuisine_type, logo_url')
    .order('name', { ascending: true })

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      <StoreDiscoveryView stores={stores ?? []} />
      <CustomerBottomNav />
    </div>
  )
}
