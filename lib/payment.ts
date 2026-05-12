import 'server-only'
import { stripe } from './stripe'

// 決済プロバイダーの抽象インターフェース
// Stripe → PayPay などへの差し替えはここだけ変更すればよい

export interface CreatePaymentResult {
  clientSecret: string
  paymentIntentId: string
}

export interface RefundPaymentResult {
  refundId: string
}

/**
 * 決済を作成して clientSecret を返す
 * @param amountJpy  金額（日本円・整数）
 * @param orderId    mocal の注文ID（Stripe メタデータに保存）
 * @param stripeConnectedAccountId  店舗の Stripe Connect アカウントID（未設定時はプラットフォームで受ける）
 */
export async function createPayment(
  amountJpy: number,
  orderId: string,
  stripeConnectedAccountId?: string | null
): Promise<CreatePaymentResult> {
  const MOCAL_FEE_RATE = 0.064 // 6.4%

  const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
    amount: amountJpy,
    currency: 'jpy',
    metadata: { order_id: orderId },
    // Apple Pay / Google Pay を含む全手段を許可
    automatic_payment_methods: { enabled: true },
  }

  if (stripeConnectedAccountId) {
    // Destination Charges: プラットフォームが決済を受け取り、
    // 指定アカウントへ transfer_data.destination で転送。
    // application_fee_amount は mocal の手数料として差し引かれる。
    params.application_fee_amount = Math.floor(amountJpy * MOCAL_FEE_RATE)
    params.transfer_data = { destination: stripeConnectedAccountId }
  }

  const intent = await stripe.paymentIntents.create(params)

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
  }
}

/**
 * 決済を返金する（cancelled 経由が必須）
 *
 * Destination Charges の返金:
 *   - refund_application_fee: true → プラットフォームが受け取った手数料を戻す
 *   - reverse_transfer: true       → 転送先アカウントへの入金も取り消す
 *   - stripeAccount ヘッダーは不要（プラットフォームアカウントの charge を返金）
 */
export async function refundPayment(
  stripeChargeId: string,
): Promise<RefundPaymentResult> {
  const refund = await stripe.refunds.create({
    charge: stripeChargeId,
    refund_application_fee: true,
    reverse_transfer: true,
  })

  return { refundId: refund.id }
}
