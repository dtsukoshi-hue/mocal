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

  // 本日 (JST) 範囲
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    { data: store },
    { data: activeOrders },
    { data: todayCompleted },
  ] = await Promise.all([
    supabase.from('stores').select('is_open, name, manual_override_until').eq('id', sessionData.storeId).single(),
    supabase
      .from('orders')
      .select(`
        id, order_number, status, total_amount, estimated_ready_at,
        accepted_at, created_at, customer_note,
        pickup_type, scheduled_at,
        order_items(name, qty, price, combo_id, combo_label)
      `)
      .eq('store_id', sessionData.storeId)
      .in('status', ['paid', 'accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: false }),
    supabase
      .from('orders')
      .select('id, total_amount')
      .eq('store_id', sessionData.storeId)
      .in('status', ['completed'])
      .gte('created_at', todayStart.toISOString()),
  ])

  const orders = activeOrders ?? []
  const newOrders     = orders.filter((o) => o.status === 'paid')
  const cookingOrders = orders.filter((o) => ['accepted', 'preparing'].includes(o.status))
  const readyOrders   = orders.filter((o) => o.status === 'ready')

  const todayTotalSales = (todayCompleted ?? []).reduce((s, o) => s + o.total_amount, 0)
  const todayCount = (todayCompleted ?? []).length + orders.length

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav
        active="orders"
        role={sessionData.role as 'owner' | 'staff'}
        rightSlot={<StoreToggle isOpen={store?.is_open ?? true} overrideUntil={store?.manual_override_until ?? null} />}
      />

      <PushSubscriber />
      <RealtimeRefresher storeId={sessionData.storeId} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {store?.name && (
          <p className="text-xs text-gray-500 px-1">{store.name}</p>
        )}

        {/* 統計グリッド（プロトタイプの「本日の注文 / 対応中 / 本日売上 / 受渡完了」相当） */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat title="本日の注文" value={`${todayCount}件`} sub="完了 + 対応中" />
          <Stat title="対応中" value={`${orders.length}件`} sub="新規 + 調理中" />
          <Stat title="本日売上" value={`¥${todayTotalSales.toLocaleString()}`} sub="完了済" />
          <Stat title="受渡完了" value={`${(todayCompleted ?? []).length}件`} sub="本日" />
        </div>

        {/* セクション別の対応中注文 */}
        {orders.length === 0 ? (
          <div className="text-center text-gray-400 py-24 text-sm">
            現在、対応中の注文はありません
          </div>
        ) : (
          <>
            {newOrders.length > 0 && (
              <Section title="🔴 新規注文" count={newOrders.length}>
                {newOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </Section>
            )}
            {cookingOrders.length > 0 && (
              <Section title="🟡 調理中" count={cookingOrders.length}>
                {cookingOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </Section>
            )}
            {readyOrders.length > 0 && (
              <Section title="✅ 準備完了" count={readyOrders.length}>
                {readyOrders.map((o) => <OrderCard key={o.id} order={o} />)}
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</h2>
        <span className="text-xs text-gray-400">{count}件</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
