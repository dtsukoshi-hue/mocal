import 'server-only'
import { Resend } from 'resend'
import type { OrderStatus } from './database.aliases'

let _resend: Resend | null = null

function getResend(): Resend {
  if (_resend) return _resend
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY が設定されていません。')
  _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export interface OrderConfirmEmailData {
  to: string
  orderNumber: number
  storeName: string
  items: { name: string; qty: number; price: number }[]
  totalAmount: number
  pickupType: 'standard' | 'scheduled'
  scheduledAt: string | null
  waitMinutes: number
  orderStatusUrl: string
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 汎用メール送信。RESEND_API_KEY 未設定環境では log のみで早期 return。
 * 注文確認以外の通知 (お問い合わせ通知等) で使用。
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[sendEmail] RESEND_API_KEY 未設定のため送信をスキップしました', { to: opts.to, subject: opts.subject })
    return
  }
  const resend = getResend()
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'mocal <noreply@mocal.jp>',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  })
}

export async function sendOrderConfirmEmail(data: OrderConfirmEmailData): Promise<void> {
  const {
    to, orderNumber, storeName, items, totalAmount,
    pickupType, scheduledAt, waitMinutes, orderStatusUrl,
  } = data

  const pickupInfo = pickupType === 'scheduled' && scheduledAt
    ? `時間指定受取：${new Date(scheduledAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}`
    : `受取予定：約${waitMinutes}分後`

  const itemsHtml = items
    .map(i => `<tr><td style="padding:6px 0;color:#374151;">${escapeHtml(i.name)} × ${i.qty}</td><td style="padding:6px 0;text-align:right;color:#374151;">¥${(i.price * i.qty).toLocaleString()}</td></tr>`)
    .join('')

  // orderStatusUrl はサーバー側で組み立てた信頼できる URL のみ渡る前提だが、
  // 防御層として HTML エスケープも実施 (F-17)
  const safeStoreUrl = orderStatusUrl.startsWith('http') ? escapeHtml(orderStatusUrl) : '#'

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#f97316;padding:24px;text-align:center;">
      <p style="color:rgba(255,255,255,0.8);margin:0 0 4px;font-size:13px;">mocal テイクアウト注文確認</p>
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">${escapeHtml(storeName)}</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">注文番号</p>
      <p style="color:#111827;font-size:28px;font-weight:800;margin:0 0 20px;">#${orderNumber}</p>

      <div style="background:#fff7ed;border-radius:10px;padding:14px;margin-bottom:20px;">
        <p style="color:#ea580c;font-size:13px;font-weight:600;margin:0;">${escapeHtml(pickupInfo)}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        ${itemsHtml}
        <tr style="border-top:2px solid #f3f4f6;">
          <td style="padding:10px 0;font-weight:700;color:#111827;">合計</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;color:#111827;">¥${totalAmount.toLocaleString()}</td>
        </tr>
      </table>

      <a href="${safeStoreUrl}" style="display:block;background:#f97316;color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin-top:20px;">
        注文状況を確認する
      </a>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;">
        このメールは mocal が自動送信しています。<br>
        ご不明な点は店舗スタッフにお声がけください。
      </p>
    </div>
  </div>
</body>
</html>`

  const resend = getResend()
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'mocal <noreply@mocal.jp>',
    to,
    subject: `【mocal】${storeName} 注文確認 #${orderNumber}`,
    html,
  })
}

// ---------------------------------------------------------------------------
// 注文ステータス変更メール（ready / cancelled / refunded）
// ---------------------------------------------------------------------------

export interface OrderStatusEmailData {
  to: string
  orderNumber: number
  storeName: string
  status: OrderStatus
  orderStatusUrl: string
}

/** ready / cancelled / refunded 時に顧客へ送信するステータス変更メール */
export async function sendOrderStatusEmail(data: OrderStatusEmailData): Promise<void> {
  const { to, orderNumber, storeName, status, orderStatusUrl } = data

  const configs: Partial<Record<OrderStatus, { subject: string; title: string; body: string; icon: string; color: string }>> = {
    ready: {
      subject: `【mocal】${storeName} 準備完了 #${orderNumber}`,
      title: '準備ができました！',
      body: 'カウンターへお越しください',
      icon: '🎉',
      color: '#16a34a',
    },
    cancelled: {
      subject: `【mocal】${storeName} 注文キャンセル #${orderNumber}`,
      title: 'ご注文はキャンセルされました',
      body: '決済済みの場合は返金処理を行います',
      icon: '❌',
      color: '#dc2626',
    },
    refunded: {
      subject: `【mocal】${storeName} 返金完了 #${orderNumber}`,
      title: '返金処理が完了しました',
      body: '決済時のカードに返金されます（数日かかる場合があります）',
      icon: '💴',
      color: '#6b7280',
    },
  }

  const config = configs[status]
  if (!config) return // 対象外ステータスはスキップ

  // orderStatusUrl は信頼できる URL 前提だが、防御層として HTML エスケープ (F-17)
  const safeStatusUrl = orderStatusUrl.startsWith('http') ? escapeHtml(orderStatusUrl) : '#'

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${config.color};padding:24px;text-align:center;">
      <p style="color:rgba(255,255,255,0.8);margin:0 0 4px;font-size:13px;">mocal テイクアウト注文</p>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${escapeHtml(storeName)}</h1>
    </div>
    <div style="padding:24px;text-align:center;">
      <p style="font-size:48px;margin:0 0 8px;">${config.icon}</p>
      <h2 style="color:#111827;font-size:20px;font-weight:700;margin:0 0 8px;">${config.title}</h2>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${config.body}</p>

      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">注文番号</p>
      <p style="color:#111827;font-size:24px;font-weight:800;margin:0 0 20px;">#${orderNumber}</p>

      <a href="${safeStatusUrl}" style="display:block;background:#f97316;color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        注文状況を確認する
      </a>

      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;">
        このメールは mocal が自動送信しています。
      </p>
    </div>
  </div>
</body>
</html>`

  const resend = getResend()
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'mocal <noreply@mocal.jp>',
    to,
    subject: config.subject,
    html,
  })
}
