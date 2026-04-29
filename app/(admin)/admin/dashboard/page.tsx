export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import OrderCard from './_components/OrderCard'
import RealtimeRefresher from './_components/RealtimeRefresher'
import StoreToggle from './_components/StoreToggle'
import PushSubscriber from './_components/PushSubscriber'
import AdminNav from '../_components/AdminNav'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()

  const [{ data: store }, { data: orders }] = await Promise.all([
    supabase.from('stores').select('is_open, name').eq('id', sessionData.storeId).single(),
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
        customer_note,
        order_items(name, qty, price)
      `)
      .eq('store_id', sessionData.storeId)
      .in('status', ['paid', 'accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav
        active="orders"
        role={sessionData.role as 'owner' | 'staff'}
        rightSlot={<StoreToggle isOpen={store?.is_open ?? true} />}
      />

      <PushSubscriber />
      <RealtimeRefresher storeId={sessionData.storeId} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {store?.name && (
          <p className="text-xs text-gray-500 px-1">{store.name}</p>
        )}
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
