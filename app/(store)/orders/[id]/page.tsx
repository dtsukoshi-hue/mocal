import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { isUuid } from '@/lib/validation'
import OrderStatusView from './_components/OrderStatusView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrderStatusPage({ params }: Props) {
  const { id } = await params

  // UUID 形式チェック（不正な ID で DB に問い合わせない）
  if (!isUuid(id)) notFound()

  // ゲスト注文は RLS の SELECT ポリシーが無いため service_role を使用。
  // UUID（122bit）を access token として扱い、最小フィールドのみクライアントへ渡す。
  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      estimated_ready_at,
      customer_note,
      stores(name),
      order_items(name, qty, price, combo_id, combo_label)
    `)
    .eq('id', id)
    .single()

  if (!order) notFound()

  return <OrderStatusView order={order} />
}
