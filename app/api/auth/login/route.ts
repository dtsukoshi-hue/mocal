import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { createSessionToken } from '@/lib/session'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { authenticateStaff } from '@/lib/staff-auth'
import { logger } from '@/lib/logger'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  // ブルートフォース対策
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('login-api', ip, 5, 60_000))) {
    logger.warn('login API rate limit exceeded', { ip })
    return NextResponse.json(
      { error: 'リクエストが多すぎます。しばらくしてから再試行してください。' },
      { status: 429 }
    )
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { email, password } = body
  if (typeof email !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
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
    return NextResponse.json({ error: '認証に失敗しました。' }, { status: 500 })
  }

  // 1. env ベースの owner と一致するか定数時間比較
  const emailOk = safeEqual(email, validEmail)
  const passOk = safeEqual(password, validPassword)

  let session: { email: string; storeId: string; role: 'owner' | 'staff' } | null = null

  if (emailOk && passOk) {
    session = { email, storeId, role: 'owner' }
  } else {
    // 2. staff_accounts でフォールバック認証
    try {
      const staff = await authenticateStaff(email, password)
      if (staff) {
        session = { email: staff.email, storeId: staff.storeId, role: staff.role }
      }
    } catch (e) {
      logger.error('staff auth error', { ip, error: String(e) })
    }
  }

  if (!session) {
    logger.warn('login API failed', { ip })
    return NextResponse.json(
      { error: 'メールアドレスまたはパスワードが正しくありません。' },
      { status: 401 }
    )
  }

  const token = createSessionToken({
    email: session.email,
    storeId: session.storeId,
    role: session.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
  logger.info('login API success', { ip, role: session.role })
  return res
}
