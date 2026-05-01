export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import SalesView from './_components/SalesView'
import AdminNav from '../_components/AdminNav'

interface Props {
  searchParams: Promise<{ range?: string }>
}

const RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export default async function SalesPage({ searchParams }: Props) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const { range } = await searchParams
  const days = RANGE_DAYS[range ?? '30d'] ?? 30
  // Server Component 内で「現在時刻」を取るのは意図的な副作用なので rule を無効化
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const supabase = createServiceClient()

  // 完了した注文のみ集計対象（cancelled/refunded/no_show は除外）
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_amount, status, created_at, order_items(name, qty, price)')
    .eq('store_id', sessionData.storeId)
    .in('status', ['completed'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="reports" role={sessionData.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">レポート</h1>
        <SalesView orders={orders ?? []} currentRange={range ?? '30d'} />
      </main>
    </div>
  )
}
