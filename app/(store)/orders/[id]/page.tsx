import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import OrderStatusView from './_components/OrderStatusView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrderStatusPage({ params }: Props) {
  const { id } = await params

  // UUID 形式チェック
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) notFound()

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      estimated_ready_at,
      store_id,
      stores(name),
      order_items(name, qty, price)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  return <OrderStatusView order={order} />
}
