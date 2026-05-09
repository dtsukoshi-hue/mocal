import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase-ssr'

// 店舗メンバーのセッション検証（React render パス内で重複呼び出しをキャッシュ）
export const verifyStoreSession = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/admin/login')
  }

  // 所属店舗を取得
  const { data: membership } = await supabase
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    redirect('/admin/login')
  }

  return {
    userId: user.id,
    email: user.email!,
    storeId: membership.store_id,
    role: membership.role,
  }
})

// セッション取得のみ（リダイレクトしない・proxy.ts 用）
export const getSession = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
})
