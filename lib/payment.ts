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
    // Direct Charges: 店舗アカウントに直接請求・mocal は application_fee_amount を受け取る
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
 */
export async function refundPayment(
  stripeChargeId: string,
  stripeConnectedAccountId?: string | null
): Promise<RefundPaymentResult> {
  const params: Parameters<typeof stripe.refunds.create>[0] = {
    charge: stripeChargeId,
  }

  // Direct Charges の場合は接続アカウントの Stripe-Account ヘッダーが必要
  const options = stripeConnectedAccountId
    ? { stripeAccount: stripeConnectedAccountId }
    : undefined

  const refund = await stripe.refunds.create(params, options)

  return { refundId: refund.id }
}
