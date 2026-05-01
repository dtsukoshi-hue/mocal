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
      stripe_receipt_url,
      stores(name),
      order_items(name, qty, price, combo_id, combo_label)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  return <ReceiptView order={order} />
}
