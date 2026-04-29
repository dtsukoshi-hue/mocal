import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import MenuList from './_components/MenuList'
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
    .select('id, name, price, category, emoji, image_url, is_available, sort_order')
    .eq('store_id', sessionData.storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="menu" role={sessionData.role as 'owner' | 'staff'} />

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">メニュー管理</h1>
        <MenuList items={items ?? []} />
      </main>
    </div>
  )
}
