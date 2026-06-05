'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

// #63 PR-3: Auth endpoint rate limit + Sentry tagging
//
// 設計 (docs/onboarding-auth-redesign.md PR-3):
//   /admin/login:
//     - IP 20 req/60s (DOS 防御)
//     - email 失敗時のみ 5 failures/5min → lockout (brute force 検出)
//   /admin/reset-password:
//     - IP 10 req/60s
//     - email 3 req/15min (token spam / enumeration 抑制)
//   全 endpoint: flow tag を統一 (auth-login / auth-reset)

export type AuthState =
  | { error: string }
  | { success: true }
  | undefined

async function getIp(): Promise<string> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }
  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }

  const ip = await getIp()
  const normalizedEmail = email.trim().toLowerCase()

  // ---------- IP-based rate limit (DOS / 高頻度防御) ----------
  if (!(await checkRateLimitAsync('login-ip', ip, 20, 60_000))) {
    logger.warn('[auth/login] IP rate limit 超過', { ip, flow: 'auth-login' })
    return { error: 'リクエストが多すぎます。しばらく時間をおいてから再度お試しください。' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })

  if (error) {
    // 失敗カウンタを email 単位で increment (5 / 5min)
    // false = lockout 期間中
    const stillAllowed = await checkRateLimitAsync('login-fail-email', normalizedEmail, 5, 5 * 60_000)

    if (!stillAllowed) {
      logger.warn('[auth/login] lockout 発生 (連続失敗閾値超過)', {
        ip,
        flow: 'auth-login',
        event: 'lockout',
      })
      return { error: '連続して認証に失敗したため、しばらくお待ちください。5分後に再度お試しください。' }
    }

    return { error: 'メールアドレスまたはパスワードが正しくありません。' }
  }

  redirect('/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/admin/login')
}

export async function resetPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get('email')
  if (typeof email !== 'string' || !email) {
    return { error: 'メールアドレスを入力してください。' }
  }

  const ip = await getIp()
  const normalizedEmail = email.trim().toLowerCase()

  // ---------- IP-based (10 / 60s) ----------
  if (!(await checkRateLimitAsync('reset-ip', ip, 10, 60_000))) {
    logger.warn('[auth/reset] IP rate limit 超過', { ip, flow: 'auth-reset' })
    // enumeration 防止: 成功を装う (rate limit を攻撃者に教えない)
    return { success: true }
  }

  // ---------- email-based (3 / 15min、token spam / enumeration 抑制) ----------
  if (!(await checkRateLimitAsync('reset-email', normalizedEmail, 3, 15 * 60_000))) {
    logger.warn('[auth/reset] email rate limit 超過', {
      ip,
      flow: 'auth-reset',
      event: 'email_rate_limit',
    })
    return { success: true }
  }

  const supabase = await createSupabaseServerClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${appUrl}/admin/reset-password`,
  })

  if (error) {
    logger.error('[auth/reset] パスワードリセット失敗', { error, flow: 'auth-reset' })
    // セキュリティ上、存在しないメールでもエラーを返さない (enumeration 防止)
  }

  return { success: true }
}
