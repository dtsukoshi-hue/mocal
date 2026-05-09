'use server'

import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'

export type OnboardingState = { error: string } | undefined

export async function registerStoreAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const storeName = formData.get('store_name')
  const slug = formData.get('slug')
  const email = formData.get('email')
  const password = formData.get('password')

  if (
    typeof storeName !== 'string' || !storeName.trim() ||
    typeof slug !== 'string' || !slug.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' || password.length < 8
  ) {
    return { error: '全ての項目を入力してください（パスワードは8文字以上）。' }
  }

  // スラッグ形式チェック
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return { error: 'URLは英小文字・数字・ハイフンのみ、3〜50文字で入力してください。' }
  }

  // Supabase Auth でユーザー作成（SSR クライアント → セッション Cookie を発行）
  const supabaseUser = await createSupabaseServerClient()
  const { data: authData, error: signUpErr } = await supabaseUser.auth.signUp({
    email: email.trim(),
    password,
  })

  if (signUpErr || !authData.user) {
    if (signUpErr?.message?.includes('already registered')) {
      return { error: 'このメールアドレスはすでに登録されています。' }
    }
    return { error: '登録に失敗しました。しばらく経ってから再試行してください。' }
  }

  const userId = authData.user.id
  const supabase = createServiceClient()

  // 店舗作成
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .insert({ name: storeName.trim(), slug: slug.trim() })
    .select('id')
    .single()

  if (storeErr || !store) {
    console.error('[onboarding/register] 店舗作成失敗:', storeErr)
    await supabase.auth.admin.deleteUser(userId)
    if (storeErr?.code === '23505') {
      return { error: 'そのURLはすでに使用されています。別のURLを入力してください。' }
    }
    return { error: '店舗の登録に失敗しました。' }
  }

  // 店舗メンバーシップ作成（owner ロール）
  const { error: memberErr } = await supabase
    .from('store_members')
    .insert({ store_id: store.id, user_id: userId, role: 'owner' })

  if (memberErr) {
    console.error('[onboarding/register] メンバーシップ作成失敗:', memberErr)
    await supabase.from('stores').delete().eq('id', store.id)
    await supabase.auth.admin.deleteUser(userId)
    return { error: '登録に失敗しました。' }
  }

  redirect('/admin/settings?welcome=1')
}
