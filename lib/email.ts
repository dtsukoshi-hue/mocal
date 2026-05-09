import 'server-only'
import { Resend } from 'resend'

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

export async function sendOrderConfirmEmail(data: OrderConfirmEmailData): Promise<void> {
  const {
    to, orderNumber, storeName, items, totalAmount,
    pickupType, scheduledAt, waitMinutes, orderStatusUrl,
  } = data

  const pickupInfo = pickupType === 'scheduled' && scheduledAt
    ? `時間指定受取：${new Date(scheduledAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}`
    : `受取予定：約${waitMinutes}分後`

  const itemsHtml = items
    .map(i => `<tr><td style="padding:6px 0;color:#374151;">${i.name} × ${i.qty}</td><td style="padding:6px 0;text-align:right;color:#374151;">¥${(i.price * i.qty).toLocaleString()}</td></tr>`)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#f97316;padding:24px;text-align:center;">
      <p style="color:rgba(255,255,255,0.8);margin:0 0 4px;font-size:13px;">mocal テイクアウト注文確認</p>
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">${storeName}</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">注文番号</p>
      <p style="color:#111827;font-size:28px;font-weight:800;margin:0 0 20px;">#${orderNumber}</p>

      <div style="background:#fff7ed;border-radius:10px;padding:14px;margin-bottom:20px;">
        <p style="color:#ea580c;font-size:13px;font-weight:600;margin:0;">${pickupInfo}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        ${itemsHtml}
        <tr style="border-top:2px solid #f3f4f6;">
          <td style="padding:10px 0;font-weight:700;color:#111827;">合計</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;color:#111827;">¥${totalAmount.toLocaleString()}</td>
        </tr>
      </table>

      <a href="${orderStatusUrl}" style="display:block;background:#f97316;color:#fff;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin-top:20px;">
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
