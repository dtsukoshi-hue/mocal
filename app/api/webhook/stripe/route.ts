import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { sendPushToStore } from '@/lib/push'
import { createServiceClient } from '@/lib/supabase-server'
import { logger } from '@/lib/logger'
import { getEnv } from '@/lib/env'

// Stripe Webhook は rawBody（Buffer）が必要。JSON.parse 前に署名検証する
export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: '署名が不正です。' }, { status: 400 })
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    // rawBody を Buffer として取得（JSON.parse 前）
    const rawBody = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(rawBody)
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, getEnv('STRIPE_WEBHOOK_SECRET'))
  } catch {
    return NextResponse.json({ error: '署名検証に失敗しました。' }, { status: 400 })
  }

  // 冪等性チェック・注文更新は内部処理のため service_role を使用（RLS バイパス）
  const supabase = createServiceClient()

  // 冪等性チェック：同じイベントを2回処理しない
  const { error: dupError } = await supabase
    .from('processed_webhook_events')
    .insert({ stripe_event_id: event.id })

  if (dupError) {
    if (dupError.code === '23505') {
      return NextResponse.json({ received: true })
    }
    logger.error('processed_webhook_events insert error', { code: dupError.code, eventId: event.id })
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

      const chargeId = typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id

      if (!store?.is_open || !amountMatch) {
        const reasonType = !amountMatch ? 'amount_mismatch' : 'store_closed'

        // 決済済み金額の自動返金（chargeId があれば Stripe で返金処理）
        let finalStatus: 'cancelled' | 'refunded' = 'cancelled'
        if (chargeId) {
          try {
            await stripe.refunds.create({
              charge: chargeId,
              // Destination Charges: 転送先への返金 + 手数料も戻す
              refund_application_fee: true,
              reverse_transfer: true,
            })
            finalStatus = 'refunded'
          } catch (e) {
            logger.error('webhook auto-refund failed', { orderId, chargeId, reason: reasonType, error: String(e) })
          }
        }

        await supabase
          .from('orders')
          .update({
            status: finalStatus,
            cancelled_reason_type: reasonType,
            stripe_charge_id: chargeId ?? null,
          })
          .eq('id', orderId)

        // 顧客へキャンセル通知（ベストエフォート）
        try {
          const { sendPushToOrder } = await import('@/lib/push')
          await sendPushToOrder(orderId, {
            title: '注文がキャンセルされました',
            body: reasonType === 'store_closed'
              ? '受付停止中のため注文をキャンセルしました。返金処理を行います。'
              : '注文の金額に問題が発生したためキャンセルしました。返金処理を行います。',
            url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/orders/${orderId}`,
          })
        } catch (e) {
          logger.warn('webhook cancel push failed', { orderId, error: String(e) })
        }

        break
      }

      // 公式レシート URL を取得（Stripe が決済完了時に自動生成）
      // Destination Charges では latest_charge はプラットフォームに紐づくため
      // 追加ヘッダ不要で retrieve できる。失敗時はスキップ。
      let receiptUrl: string | null = null
      if (chargeId) {
        try {
          const charge = await stripe.charges.retrieve(chargeId)
          receiptUrl = charge.receipt_url ?? null
        } catch (e) {
          logger.warn('charge retrieve failed', { chargeId, error: String(e) })
        }
      }

      await supabase
        .from('orders')
        .update({
          status: 'paid',
          stripe_charge_id: chargeId ?? null,
          stripe_receipt_url: receiptUrl,
        })
        .eq('id', orderId)

      // 店舗へ新規注文プッシュ通知
      try {
        await sendPushToStore(order.store_id, {
          title: '🔔 新規注文が入りました',
          body: `注文 #${order.order_number} ¥${order.total_amount.toLocaleString()}`,
          url: `${getEnv('NEXT_PUBLIC_APP_URL')}/admin/dashboard`,
        })
      } catch (e) {
        logger.error('push notification error', { orderId, error: String(e) })
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

    case 'account.updated': {
      // Stripe Connect オンボーディング完了通知
      // metadata.store_id があれば store の状態を更新（現状は stripe_account_id 保存のみ）
      // 将来 charges_enabled / payouts_enabled をミラーする場合はここで更新
      const account = event.data.object
      logger.info('stripe account updated', {
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
