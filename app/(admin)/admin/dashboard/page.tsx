export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import OrderCard from './_components/OrderCard'
import RealtimeRefresher from './_components/RealtimeRefresher'
import StoreToggle from './_components/StoreToggle'
import PushSubscriber from './_components/PushSubscriber'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()

  const [{ data: store }, { data: orders }] = await Promise.all([
    supabase.from('stores').select('is_open').eq('id', sessionData.storeId).single(),
    supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_amount,
        estimated_ready_at,
        accepted_at,
        created_at,
        order_items(name, qty, price)
      `)
      .eq('store_id', sessionData.storeId)
      .in('status', ['paid', 'accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-bold text-gray-900 shrink-0">注文管理</span>
            <StoreToggle isOpen={store?.is_open ?? true} />
          </div>
          <nav className="flex items-center gap-1 shrink-0">
            <Link href="/admin/menu" className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
              メニュー
            </Link>
            <Link href="/admin/history" className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
              履歴
            </Link>
            <Link href="/admin/settings" className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
              設定
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
                ログアウト
              </button>
            </form>
          </nav>
        </div>
      </header>

      <PushSubscriber />
      <RealtimeRefresher storeId={sessionData.storeId} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {(!orders || orders.length === 0) && (
          <div className="text-center text-gray-400 py-24 text-sm">
            現在、対応中の注文はありません
          </div>
        )}

        {orders?.map(order => (
          <OrderCard key={order.id} order={order} />
        ))}
      </main>
    </div>
  )
}
