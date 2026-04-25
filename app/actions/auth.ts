'use server'

import { redirect } from 'next/navigation'
import { setSession, clearSession } from '@/lib/session'

export type AuthState =
  | { error: string }
  | { success: true }
  | undefined

export async function loginAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }

  const validEmail = process.env.ADMIN_EMAIL
  const validPassword = process.env.ADMIN_PASSWORD
  const storeId = process.env.ADMIN_STORE_ID

  if (!validEmail || !validPassword || !storeId) {
    return { error: 'サーバー設定エラー: env未設定' }
  }

  if (email !== validEmail || password !== validPassword) {
    return { error: `認証失敗: email=${email === validEmail} pass=${password === validPassword} len=${password.length}/${validPassword.length}` }
  }

  try {
    await setSession({ email, storeId, role: 'owner' })
  } catch (e) {
    return { error: 'セッション作成エラー: ' + String(e) }
  }

  redirect('/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  await clearSession()
  redirect('/admin/login')
}
