export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { logoutAction } from '@/app/actions/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
              ← 注文管理
            </Link>
            <h1 className="text-lg font-bold text-gray-900">注文履歴</h1>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {(!orders || orders.length === 0) && (
          <div className="text-center text-gray-400 py-16 text-sm">履歴がありません</div>
        )}

        {orders?.map(order => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">#{order.order_number}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[order.status]}`}>
                  {statusLabel[order.status]}
                </span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">¥{order.total_amount.toLocaleString()}</p>
                <p className="text-xs text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <ul className="mt-2 text-sm text-gray-500 space-y-0.5">
              {order.order_items?.map((item, i) => (
                <li key={i}>{item.name} × {item.qty}</li>
              ))}
            </ul>
          </div>
        ))}
      </main>
    </div>
  )
}
