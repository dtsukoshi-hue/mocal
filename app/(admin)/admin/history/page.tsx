export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminNav from '../_components/AdminNav'

const statusLabel: Record<string, string> = {
  completed: '受取完了',
  no_show:   '未受取',
  cancelled: 'キャンセル',
  refunded:  '返金済',
}

const statusColor: Record<string, string> = {
  completed: 'bg-gray-100 text-gray-600',
  no_show:   'bg-red-100 text-red-600',
  cancelled: 'bg-orange-100 text-orange-600',
  refunded:  'bg-purple-100 text-purple-600',
}

export default async function HistoryPage() {
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
      created_at,
      order_items(name, qty)
    `)
    .eq('store_id', sessionData.storeId)
    .in('status', ['completed', 'no_show', 'cancelled', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="history" role={sessionData.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6 space-y-2">
        <h1 className="text-lg font-bold text-gray-900 mb-2">注文履歴</h1>
        {(!orders || orders.length === 0) && (
          <div className="text-center text-gray-400 py-24 text-sm">履歴がありません</div>
        )}

        {orders?.map(order => (
          <div key={order.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900 text-sm">#{order.order_number}</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor[order.status]}`}>
                  {statusLabel[order.status]}
                </span>
                <span className="text-xs text-gray-400 hidden sm:block">
                  {new Date(order.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span className="font-semibold text-gray-900 text-sm">¥{order.total_amount.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {order.order_items?.map((item, i) => (
                <span key={i} className="text-xs text-gray-500">{item.name} × {item.qty}</span>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1 sm:hidden">
              {new Date(order.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}
      </main>
    </div>
  )
}
