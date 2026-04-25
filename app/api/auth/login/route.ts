import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const validEmail = process.env.ADMIN_EMAIL
  const validPassword = process.env.ADMIN_PASSWORD
  const storeId = process.env.ADMIN_STORE_ID

  if (!validEmail || !validPassword || !storeId) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  if (email !== validEmail || password !== validPassword) {
    return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません。' }, { status: 401 })
  }

  const token = createSessionToken({
    email,
    storeId,
    role: 'owner',
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
  return res
}
