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
 *
 * @param amountJpy                  金額（日本円・整数）
 * @param orderId                    mocal の注文 ID（Stripe メタデータに保存）
 * @param stripeConnectedAccountId   店舗の Stripe Connect アカウント ID（必須・NULL 不可）
 * @param receiptEmail               レシート送信先メール（任意）
 *
 * ## 決済モデル — Destination Charges + on_behalf_of (取次事業者モデル)
 *
 *   - PaymentIntent はプラットフォーム (mocal) アカウントで作成
 *   - charge はプラットフォームに作成され、`transfer_data.destination` で
 *     接続アカウント（店舗）へ自動送金
 *   - `on_behalf_of` で Stripe 上の merchant of record を店舗に一致させる
 *     (カード明細 / receipt / 統計上の merchant 表示)。
 *     詳細: docs/payment-design-legal.md §3.1, §3.2
 *   - `application_fee_amount` = mocal の手数料（送金額から差し引かれる）
 *   - charge 取得・返金はプラットフォーム側で行う（stripeAccount ヘッダー不要）
 *
 * ## NULL を受け入れない理由
 *
 *   `stripeConnectedAccountId` が未設定だと、Stripe Connect を経由しない通常
 *   charge が作成され、**mocal (無登録) が販売者として顧客から代金を預かり、
 *   後で店舗に送金する** 構造になる。これは資金決済法 §37 (為替取引の業として
 *   の営みは資金移動業の登録が必要) に違反し得る。
 *
 *   詳細: `docs/payment-design-legal.md` §3 / §4 (L3)
 *
 *   呼び出し側で NULL を弾けない場合 (DB 制約や公開フィルタの不具合) でも、
 *   この関数で throw して **5 重防御の 1 層** を担う。
 *
 * @throws Error - `stripeConnectedAccountId` が未設定 (null / undefined / 空文字)
 */
export async function createPayment(
  amountJpy: number,
  orderId: string,
  stripeConnectedAccountId: string | null | undefined,
  receiptEmail?: string | null,
): Promise<CreatePaymentResult> {
  if (!stripeConnectedAccountId) {
    throw new Error(
      '店舗の Stripe Connect アカウントが未設定です。Connect onboarding 未完了の店舗は決済を受け付けられません (docs/payment-design-legal.md L3)',
    )
  }

  const MOCAL_FEE_RATE = 0.064 // 6.4%

  const stripe = getStripe()
  const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
    amount: amountJpy,
    currency: 'jpy',
    metadata: { order_id: orderId },
    // Apple Pay / Google Pay を含む全手段を許可
    automatic_payment_methods: { enabled: true },
    application_fee_amount: Math.floor(amountJpy * MOCAL_FEE_RATE),
    transfer_data: { destination: stripeConnectedAccountId },
    // 取次事業者モデル: Stripe 上の merchant of record を店舗に一致させる
    on_behalf_of: stripeConnectedAccountId,
    ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
  }

  const intent = await stripe.paymentIntents.create(params)

  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
  }
}

/**
 * 決済を返金する（cancelled / refunded 経由が必須）
 *
 * Destination Charges では charge はプラットフォームに存在するため、
 * `stripeAccount` ヘッダーなしでプラットフォーム側から返金する。
 * Stripe が自動的に接続アカウントへの transfer を逆転させる。
 *
 * @param stripeChargeId  Stripe Charge ID
 */
export async function refundPayment(
  stripeChargeId: string,
): Promise<RefundPaymentResult> {
  const stripe = getStripe()
  const refund = await stripe.refunds.create({ charge: stripeChargeId })
  return { refundId: refund.id }
}
