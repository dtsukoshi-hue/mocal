import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { sendPushToStore } from '@/lib/push'
import type { Database } from '@/lib/database.types'

// Stripe Webhook は rawBody（Buffer）が必要。JSON.parse 前に署名検証する
export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: '署名が不正です。' }, { status: 400 })
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    // rawBody を Buffer として取得（JSON.parse 前）
    const rawBody = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(rawBody)
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: '署名検証に失敗しました。' }, { status: 400 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 冪等性チェック：同じイベントを2回処理しない
  const { error: dupError } = await supabase
    .from('processed_webhook_events')
    .insert({ stripe_event_id: event.id })

  if (dupError) {
    if (dupError.code === '23505') {
      return NextResponse.json({ received: true })
    }
    console.error('[webhook] processed_webhook_events insert error:', dupError.code)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object
      const orderId = intent.metadata?.order_id
      if (!orderId) break

      const { data: order } = await supabase
        .from('orders')
        .select('store_id, total_amount, status, order_number')
        .eq('id', orderId)
        .eq('stripe_payment_intent_id', intent.id)
        .single()

      if (!order || order.status !== 'pending') break

      const { data: store } = await supabase
        .from('stores')
        .select('is_open, name')
        .eq('id', order.store_id)
        .single()

      const amountMatch = intent.amount === order.total_amount

      if (!store?.is_open || !amountMatch) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancelled_reason_type: !amountMatch ? 'amount_mismatch' : 'store_closed',
          })
          .eq('id', orderId)
        break
      }

      const chargeId = typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id

      await supabase
        .from('orders')
        .update({
          status: 'paid',
          stripe_charge_id: chargeId ?? null,
        })
        .eq('id', orderId)

      // 店舗へ新規注文プッシュ通知
      try {
        await sendPushToStore(order.store_id, {
          title: '🔔 新規注文が入りました',
          body: `注文 #${order.order_number} ¥${order.total_amount.toLocaleString()}`,
          url: 'https://mocal-iota.vercel.app/admin/dashboard',
        })
      } catch (e) {
        console.error('[webhook] push notification error:', e)
      }

      break
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object
      const orderId = intent.metadata?.order_id
      if (!orderId) break

      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_reason_type: 'payment_failed',
        })
        .eq('id', orderId)
        .eq('status', 'pending')

      break
    }
  }

  return NextResponse.json({ received: true })
}
