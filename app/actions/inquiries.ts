'use server'

import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { sendEmail, escapeHtml } from '@/lib/email'
import { logger } from '@/lib/logger'

export type InquiryState =
  | { success: true }
  | { error: string }
  | undefined

export async function submitInquiryAction(
  _prevState: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('inquiry-submit', ip, 3, 60_000))) {
    return { error: 'しばらく時間をおいてから再度お試しください。' }
  }

  const name = formData.get('name')?.toString().trim() ?? ''
  const storeName = formData.get('store_name')?.toString().trim() ?? ''
  const email = formData.get('email')?.toString().trim() ?? ''
  const message = formData.get('message')?.toString().trim() ?? ''

  if (!name || !storeName || !email) {
    return { error: 'お名前・店舗名・メールアドレスは必須です。' }
  }
  if (name.length > 100 || storeName.length > 200 || email.length > 254 || message.length > 2000) {
    return { error: '入力内容が長すぎます。' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'メールアドレスの形式が正しくありません。' }
  }

  const supabase = createServiceClient()
  const { error: insertErr } = await supabase.from('store_inquiries').insert({
    name,
    store_name: storeName,
    email,
    message: message || null,
  })

  if (insertErr) {
    logger.error('inquiry insert error', { error: insertErr.message })
    return { error: '送信に失敗しました。時間をおいて再度お試しください。' }
  }

  // 管理者へメール通知 (best-effort; 失敗してもユーザー応答には影響させない)
  const notifyTo = process.env.INQUIRY_NOTIFICATION_EMAIL
  if (notifyTo) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    try {
      await sendEmail({
        to: notifyTo,
        subject: `[mocal] 新規お問い合わせ — ${storeName}`,
        replyTo: email,
        html: `
          <div style="font-family:system-ui,sans-serif;color:#111;max-width:560px;">
            <h2 style="font-size:18px;margin-bottom:16px;">新規お問い合わせが届きました</h2>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
              <tr><td style="padding:6px 0;color:#666;width:120px;">店舗名</td><td style="padding:6px 0;">${escapeHtml(storeName)}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">お名前</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">メール</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            </table>
            ${message ? `<div style="margin-top:16px;padding:12px;background:#f7f3ee;border-radius:8px;font-size:13px;white-space:pre-wrap;">${escapeHtml(message)}</div>` : ''}
            ${appUrl ? `<p style="margin-top:24px;font-size:13px;"><a href="${appUrl}/admin/inquiries" style="color:#b45309;">管理画面で確認する →</a></p>` : ''}
          </div>
        `,
        text: [
          '新規お問い合わせが届きました',
          '',
          `店舗名: ${storeName}`,
          `お名前: ${name}`,
          `メール: ${email}`,
          ...(message ? ['', '本文:', message] : []),
          ...(appUrl ? ['', `${appUrl}/admin/inquiries`] : []),
        ].join('\n'),
      })
    } catch (e) {
      logger.error('inquiry email error', { error: String(e) })
    }
  }

  return { success: true }
}
