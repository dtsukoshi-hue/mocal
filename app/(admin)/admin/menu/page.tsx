import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import MenuList from './_components/MenuList'

export default async function MenuPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()

  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, price, category, emoji, is_available, sort_order')
    .eq('store_id', sessionData.storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
              ← 注文管理
            </Link>
            <h1 className="text-lg font-bold text-gray-900">メニュー管理</h1>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <MenuList items={items ?? []} />
      </main>
    </div>
  )
}
