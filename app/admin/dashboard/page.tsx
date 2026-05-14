import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { logoutAction } from '@/app/actions/auth'
import Link from 'next/link'
import StorePushSubscribe from './_components/StorePushSubscribe'
import StoreOpenToggle from '../settings/_components/StoreOpenToggle'
import OrderActions from './_components/OrderActions'
import RealtimeDashboard from './_components/RealtimeDashboard'
import ElapsedTime from './_components/ElapsedTime'

export const metadata: Metadata = { title: '注文管理 | mocal' }

export default async function DashboardPage() {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  // 今日の売上 KPI（JST の当日 00:00 起点）
  // setHours は UTC サーバーでは JST のゼロ時にならないため Intl を使用
  const todayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const todayStart = new Date(`${todayJST}T00:00:00+09:00`)

  // 店舗ステータス・KPI・対応中注文を並列取得（相互に独立）
  const [
    { data: storeStatus },
    { data: todayOrders },
    { data: orders },
  ] = await Promise.all([
    supabase
      .from('stores')
      .select('is_open, wait_minutes')
      .eq('id', session.storeId)
      .single(),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('store_id', session.storeId)
      .in('status', ['paid', 'accepted', 'preparing', 'ready', 'completed', 'no_show'])
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_amount,
        pickup_type,
        scheduled_at,
        estimated_ready_at,
        customer_note,
        created_at,
        order_items(name, qty, price)
      `)
      .eq('store_id', session.storeId)
      .in('status', ['paid', 'accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: true }),
  ])

  const todaySales = (todayOrders ?? []).reduce((sum, o) => sum + o.total_amount, 0)
  const todayCount = (todayOrders ?? []).length

  // scheduled_at が設定されている注文を優先：受取時刻の近い順に先頭表示
  const sortedOrders = (orders ?? []).slice().sort((a, b) => {
    // まず ready → preparing → accepted → paid の優先度
    const statusPriority: Record<string, number> = { ready: 0, preparing: 1, accepted: 2, paid: 3 }
    const pa = statusPriority[a.status] ?? 9
    const pb = statusPriority[b.status] ?? 9
    if (pa !== pb) return pa - pb
    // 同一ステータス内では scheduled_at を優先（早い受取が上）
    if (a.scheduled_at && b.scheduled_at) {
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    }
    if (a.scheduled_at) return -1
    if (b.scheduled_at) return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const paidCount = (orders ?? []).filter(o => o.status === 'paid').length

  const statusLabel: Record<string, string> = {
    paid:      '新規注文',
    accepted:  '受理済',
    preparing: '調理中',
    ready:     '受取可能',
  }

  const statusColor: Record<string, string> = {
    paid:      'bg-yellow-100 text-yellow-800',
    accepted:  'bg-blue-100 text-blue-800',
    preparing: 'bg-purple-100 text-purple-800',
    ready:     'bg-green-100 text-green-800',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-lg font-bold text-gray-900">注文管理</h1>
            {paidCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                {paidCount}
              </span>
            )}
          </div>
          {/* モバイルでも横スクロールで全リンクにアクセスできるようにする */}
          <nav className="flex items-center gap-3 overflow-x-auto scrollbar-none flex-1 min-w-0">
            <Link href="/admin/history" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">履歴</Link>
            <Link href="/admin/reports" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">レポート</Link>
            <Link href="/admin/menu" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">メニュー</Link>
            <Link href="/admin/hours" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">営業時間</Link>
            <Link href="/admin/members" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">スタッフ</Link>
            <Link href="/admin/settings" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">設定</Link>
            <StorePushSubscribe storeId={session.storeId} />
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">
                ログアウト
              </button>
            </form>
          </nav>
        </div>
      </header>

      <RealtimeDashboard storeId={session.storeId} initialPaidCount={paidCount} />

      {/* 今日の KPI + 受付トグル */}
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">本日の売上</p>
            <p className="text-2xl font-bold text-gray-900">¥{todaySales.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">本日の注文数</p>
            <p className="text-2xl font-bold text-gray-900">{todayCount}<span className="text-sm font-normal text-gray-400 ml-1">件</span></p>
          </div>
        </div>
        <StoreOpenToggle isOpen={storeStatus?.is_open ?? false} />
      </div>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {sortedOrders.length === 0 && (
          <div className="text-center text-gray-400 py-16 text-sm">
            現在、対応中の注文はありません
          </div>
        )}

        {sortedOrders.map(order => (
          <div
            key={order.id}
            className={`bg-white rounded-xl shadow-sm p-5 space-y-3 ${
              order.status === 'paid' ? 'ring-2 ring-yellow-400' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-gray-900">#{order.order_number}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[order.status]}`}>
                  {statusLabel[order.status]}
                </span>
                {order.pickup_type === 'scheduled' && order.scheduled_at && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                    🕐 {new Date(order.scheduled_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} 指定
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                ¥{order.total_amount.toLocaleString()}
              </span>
            </div>

            <ul className="text-sm text-gray-600 space-y-0.5">
              {order.order_items?.map((item, i) => (
                <li key={i}>{item.name} × {item.qty}</li>
              ))}
            </ul>

            {order.customer_note && (
              <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
                📝 {order.customer_note}
              </div>
            )}

            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-400">{new Date(order.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} 注文</span>
              {order.estimated_ready_at && (
                <span className="text-gray-400">受取予定 {new Date(order.estimated_ready_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}</span>
              )}
              {/* paid 注文は5分以上経過で赤表示して緊急度を示す */}
              <ElapsedTime
                createdAt={order.created_at}
                warnAfterMinutes={order.status === 'paid' ? 5 : undefined}
              />
            </div>

            <OrderActions
              orderId={order.id}
              status={order.status as 'paid' | 'accepted' | 'preparing' | 'ready'}
              defaultWaitMinutes={storeStatus?.wait_minutes ?? 20}
            />
          </div>
        ))}
      </main>
    </div>
  )
}
