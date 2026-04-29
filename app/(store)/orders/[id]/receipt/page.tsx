import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import ReceiptView from './_components/ReceiptView'
import { isUuid } from '@/lib/validation'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReceiptPage({ params }: Props) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      created_at,
      ready_at,
      stores(name),
      order_items(name, qty, price)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  return <ReceiptView order={order} />
}
