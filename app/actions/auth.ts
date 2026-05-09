'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'

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

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
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

  const supabase = await createSupabaseServerClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mocal.jp'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/admin/reset-password`,
  })

  if (error) {
    console.error('[auth/reset] パスワードリセット失敗:', error)
    // セキュリティ上、存在しないメールでもエラーを返さない
  }

  return { success: true }
}
