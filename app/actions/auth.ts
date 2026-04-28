'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { setSession, clearSession } from '@/lib/session'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export type AuthState =
  | { error: string }
  | { success: true }
  | undefined

// 文字列の定数時間比較（length が異なる場合も timing を漏らさない）
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // 長さが違う場合は同じ長さの安全比較を実施した上で false を返す
  if (ab.length !== bb.length) {
    // ダミー比較で時間を均す
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  // ブルートフォース対策: IP 単位で 1 分間に 5 回まで
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('login', ip, 5, 60_000))) {
    logger.warn('login rate limit exceeded', { ip })
    return { error: 'リクエストが多すぎます。しばらくしてから再試行してください。' }
  }

  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }

  const validEmail = process.env.ADMIN_EMAIL
  const validPassword = process.env.ADMIN_PASSWORD
  const storeId = process.env.ADMIN_STORE_ID
  const sessionSecret = process.env.SESSION_SECRET

  if (!validEmail || !validPassword || !storeId || !sessionSecret) {
    logger.error('login env not configured', {
      hasEmail: !!validEmail,
      hasPassword: !!validPassword,
      hasStoreId: !!storeId,
      hasSecret: !!sessionSecret,
    })
    return { error: '認証に失敗しました。' }
  }

  // 定数時間比較（タイミング攻撃対策）。両方を必ず計算する。
  const emailOk = safeEqual(email, validEmail)
  const passOk = safeEqual(password, validPassword)

  if (!emailOk || !passOk) {
    logger.warn('login failed', { ip })
    return { error: 'メールアドレスまたはパスワードが正しくありません。' }
  }

  try {
    await setSession({ email, storeId, role: 'owner' })
  } catch (e) {
    logger.error('session creation failed', { ip, error: String(e) })
    return { error: '認証に失敗しました。' }
  }

  logger.info('login success', { ip })
  redirect('/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  await clearSession()
  redirect('/admin/login')
}
