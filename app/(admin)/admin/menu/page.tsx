import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import MenuList from './_components/MenuList'
import CombosManager from './_components/CombosManager'
import AdminNav from '../_components/AdminNav'

export default async function MenuPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()

  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, price, description, category, emoji, image_url, is_available, sort_order')
    .eq('store_id', sessionData.storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="menu" role={sessionData.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        <section>
          <h1 className="text-lg font-bold text-gray-900 mb-4">メニュー管理</h1>
          <MenuList items={items ?? []} />
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3">🎁 お得なセット（コンボ商品）</h2>
          <p className="text-xs text-gray-500 mb-3">
            既存メニューの組み合わせを「セット」として提示できます。注文時には個別の商品として展開されます。
          </p>
          <CombosManager
            menuItems={(items ?? []).map((i) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              emoji: i.emoji,
            }))}
          />
        </section>
      </main>
    </div>
  )
}
