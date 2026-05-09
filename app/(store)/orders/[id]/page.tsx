import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase-server'
import OrderStatusView from './_components/OrderStatusView'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, stores(name)')
    .eq('id', id)
    .single()

  if (!order) return { title: '注文が見つかりません | mocal' }
  const storeName = (order.stores as { name: string } | null)?.name ?? ''
  return {
    title: `注文 #${order.order_number} — ${storeName} | mocal`,
    robots: { index: false },
  }
}

export default async function OrderStatusPage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      pickup_type,
      scheduled_at,
      customer_note,
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
