import 'server-only'
import { getStripe } from './stripe'

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
 *
 * Destination Charges パターンを使用:
 *   - PaymentIntent はプラットフォームアカウントで作成
 *   - charge はプラットフォームに作成され、transfer_data で接続アカウントへ自動送金
 *   - application_fee_amount = mocal の手数料（送金額から差し引かれる）
 *   - charge 取得・返金はプラットフォーム側で行う（stripeAccount ヘッダー不要）
 */
export async function createPayment(
  amountJpy: number,
  orderId: string,
  stripeConnectedAccountId?: string | null,
  receiptEmail?: string | null
): Promise<CreatePaymentResult> {
  const MOCAL_FEE_RATE = 0.064 // 6.4%

  const stripe = getStripe()
  const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
    amount: amountJpy,
    currency: 'jpy',
    metadata: { order_id: orderId },
    // Apple Pay / Google Pay を含む全手段を許可
    automatic_payment_methods: { enabled: true },
    ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
  }

  if (stripeConnectedAccountId) {
    // Destination Charges: プラットフォームで charge を作成し接続アカウントへ自動送金
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
 * Destination Charges では charge はプラットフォームに存在するため、
 * stripeAccount ヘッダーなしでプラットフォーム側から返金する。
 * Stripe が自動的に接続アカウントへの transfer を逆転させる。
 */
export async function refundPayment(
  stripeChargeId: string,
  // 引数は API 互換のため残してあるが、Destination Charges では使わない。
  // アンダースコア prefix が eslint の argsIgnorePattern に matchして
  // 未使用警告は出ない (eslint.config.mjs 参照)。
  _stripeConnectedAccountId?: string | null,
): Promise<RefundPaymentResult> {
  const stripe = getStripe()

  // Destination Charges: charge はプラットフォームに存在するため stripeAccount 不要
  const refund = await stripe.refunds.create({ charge: stripeChargeId })

  return { refundId: refund.id }
}
