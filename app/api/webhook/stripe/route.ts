import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { refundPayment } from '@/lib/payment'
import { notifyStore, notifyOrder } from '@/lib/webpush'
import { createServiceClient } from '@/lib/supabase-server'
import { sendOrderConfirmEmail } from '@/lib/email'

// Stripe Webhook は rawBody（Buffer）が必要。JSON.parse 前に署名検証する
export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: '署名が不正です。' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const rawBody = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(rawBody)
    event = getStripe().webhooks.constructEvent(bodyBuffer, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: '署名検証に失敗しました。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 冪等性チェック（仕様書 7.5）
  // unique constraint (23505) = 処理済み → スキップ
  // それ以外のエラー = DB 障害 → 500 で Stripe にリトライさせる
  const { error: dupError } = await supabase
    .from('processed_webhook_events')
    .insert({ stripe_event_id: event.id })

  if (dupError) {
    if (dupError.code === '23505') {
      return NextResponse.json({ received: true })
    }
    console.error('[webhook] processed_webhook_events INSERT 失敗:', dupError)
    return NextResponse.json({ error: 'DB エラー' }, { status: 500 })
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object
      const orderId = intent.metadata?.order_id
      if (!orderId) break

      // 仕様書 7.2 ステップ5：Webhook 時の2回目チェック
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('store_id, user_id, total_amount, status')
        .eq('id', orderId)
        .eq('stripe_payment_intent_id', intent.id)
        .single()

      if (orderErr) {
        console.error('[webhook] 注文取得失敗:', orderErr)
        break
      }
      if (!order) break

      // cron タイムアウト等で既にキャンセル済みの場合 → 自動返金して終了
      // （顧客は決済されたのに注文が存在しない状態を防ぐ）
      if (order.status === 'cancelled') {
        const chargeId = typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : intent.latest_charge?.id ?? null
        if (chargeId) {
          const { data: storeForRefund } = await supabase
            .from('stores')
            .select('stripe_account_id')
            .eq('id', order.store_id)
            .single()
          try {
            await refundPayment(chargeId, storeForRefund?.stripe_account_id)
            await supabase.from('orders').update({ status: 'refunded', stripe_charge_id: chargeId }).eq('id', orderId)
            notifyOrder(orderId, {
              title: 'キャンセル・返金のお知らせ',
              body: '注文がキャンセルされていたため、返金処理を行いました',
              url: `/orders/${orderId}`,
            }).catch((e) => console.error('[webhook] タイムアウト返金通知失敗:', e))
          } catch (err) {
            console.error('[webhook] タイムアウトキャンセル後の返金失敗（手動対応必要）charge:', chargeId, err)
          }
        }
        break
      }

      if (order.status !== 'pending') break

      const { data: store, error: storeErr } = await supabase
        .from('stores')
        .select('stripe_account_id, is_open')
        .eq('id', order.store_id)
        .single()

      if (storeErr) {
        console.error('[webhook] 店舗取得失敗:', storeErr)
        break
      }

      // 金額整合チェック（JPY は amount がそのまま円）
      const amountMatch = intent.amount === order.total_amount

      // Charge ID と receipt_url を取得（返金・領収書に使用）
      const chargeId = typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id ?? null

      // Charge オブジェクトから receipt_url を取得（CustomerFacing に表示するため）
      // Destination Charges では charge はプラットフォームに存在するため stripeAccount 不要
      let receiptUrl: string | null = null
      if (chargeId) {
        try {
          const charge = await getStripe().charges.retrieve(chargeId)
          receiptUrl = charge.receipt_url ?? null
        } catch (err) {
          console.error('[webhook] charge 取得失敗:', err)
        }
      }

      if (!store?.is_open || !amountMatch) {
        // チェック NG → cancelled → refunded（仕様書 6.3）
        const { error: cancelErr } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            cancelled_reason_type: !amountMatch ? 'amount_mismatch' : 'store_closed',
          })
          .eq('id', orderId)

        if (cancelErr) {
          console.error('[webhook] 注文キャンセル更新失敗:', cancelErr)
          break
        }

        if (chargeId) {
          try {
            await refundPayment(chargeId, store?.stripe_account_id)
            const { error: refundUpdateErr } = await supabase
              .from('orders')
              .update({ status: 'refunded' })
              .eq('id', orderId)

            if (refundUpdateErr) {
              console.error('[webhook] refunded 更新失敗:', refundUpdateErr)
            } else {
              notifyOrder(orderId, {
                title: 'キャンセル・返金のお知らせ',
                body: '注文がキャンセルされ、返金処理を行いました',
                url: `/orders/${orderId}`,
              }).catch((e) => console.error('[webhook] 通知送信失敗:', e))
            }
          } catch (err) {
            // Stripe 返金失敗：注文は cancelled のまま、手動対応が必要
            console.error('[webhook] Stripe 返金失敗（手動対応必要）charge:', chargeId, err)
          }
        }
        break
      }

      const { error: paidErr } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          stripe_charge_id: chargeId,
          ...(receiptUrl ? { stripe_receipt_url: receiptUrl } : {}),
        })
        .eq('id', orderId)

      if (paidErr) {
        console.error('[webhook] paid 更新失敗:', paidErr)
        break
      }

      // 店舗へ新規注文通知（tag=new-order で同種の通知を1つにまとめ、複数注文でも通知過多を防ぐ）
      notifyStore(order.store_id, {
        title: '新規注文が入りました',
        body: `¥${order.total_amount.toLocaleString()} の注文を確認してください`,
        url: '/admin/dashboard',
        tag: 'mocal-new-order',
      }).catch((e) => console.error('[webhook] 店舗通知失敗:', e))

      // 顧客へ注文確認メール（メールアドレスがある場合のみ）
      if (process.env.RESEND_API_KEY) {
        const { data: orderDetail } = await supabase
          .from('orders')
          .select(`
            order_number,
            pickup_type,
            scheduled_at,
            order_items(name, price, qty),
            stores(name, wait_minutes)
          `)
          .eq('id', orderId)
          .single()

        // ログインユーザーのメールアドレスを優先、なければ Stripe のレシートメール
        let customerEmail = intent.receipt_email
        if (!customerEmail && order.user_id) {
          const { data: { user: authUser } } = await supabase.auth.admin.getUserById(order.user_id)
          customerEmail = authUser?.email ?? null
        }
        if (customerEmail && orderDetail) {
          const storeName = (orderDetail.stores as { name: string; wait_minutes: number } | null)?.name ?? ''
          const waitMinutes = (orderDetail.stores as { name: string; wait_minutes: number } | null)?.wait_minutes ?? 20
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
          sendOrderConfirmEmail({
            to: customerEmail,
            orderNumber: orderDetail.order_number,
            storeName,
            items: (orderDetail.order_items ?? []) as { name: string; qty: number; price: number }[],
            totalAmount: order.total_amount,
            pickupType: (orderDetail.pickup_type ?? 'standard') as 'standard' | 'scheduled',
            scheduledAt: orderDetail.scheduled_at ?? null,
            waitMinutes,
            orderStatusUrl: `${appUrl}/orders/${orderId}`,
          }).catch((e) => console.error('[webhook] 確認メール送信失敗:', e))
        }
      }

      break
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object
      const orderId = intent.metadata?.order_id
      if (!orderId) break

      const { error: cancelErr } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_reason_type: 'payment_failed',
        })
        .eq('id', orderId)
        .eq('status', 'pending')

      if (cancelErr) {
        console.error('[webhook] 決済失敗キャンセル更新失敗:', cancelErr)
      }

      break
    }

    case 'charge.refunded': {
      // Stripe ダッシュボード等から外部で返金された場合の同期
      const charge = event.data.object
      const chargeId = charge.id

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id')
        .eq('stripe_charge_id', chargeId)
        .maybeSingle()

      if (orderErr) {
        console.error('[webhook/charge.refunded] 注文取得失敗:', orderErr)
        break
      }
      if (!order) break

      const { error: updateErr } = await supabase
        .from('orders')
        .update({ status: 'refunded' })
        .eq('id', order.id)
        .neq('status', 'refunded')

      if (updateErr) {
        console.error('[webhook/charge.refunded] refunded 更新失敗:', updateErr)
        break
      }

      notifyOrder(order.id, {
        title: '返金処理が完了しました',
        body: 'ご注文の返金が完了しました',
        url: `/orders/${order.id}`,
      }).catch((e) => console.error('[webhook/charge.refunded] 通知失敗:', e))

      break
    }
  }

  return NextResponse.json({ received: true })
}
