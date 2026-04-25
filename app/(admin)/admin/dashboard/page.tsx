export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import OrderCard from './_components/OrderCard'
import RealtimeRefresher from './_components/RealtimeRefresher'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()

  const { data: orders } = await supabase
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
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-gray-900">注文管理</h1>
            <Link href="/admin/menu" className="text-sm text-blue-500 hover:text-blue-700">
              メニュー管理
            </Link>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <RealtimeRefresher storeId={sessionData.storeId} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {(!orders || orders.length === 0) && (
          <div className="text-center text-gray-400 py-16 text-sm">
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
