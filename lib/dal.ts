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

// mocal platform admin (運営側) かどうかを判定。
// env `MOCAL_PLATFORM_ADMIN_EMAILS` (カンマ区切り) に列挙された email のみ true。
// 未設定なら誰も platform admin ではない (= 安全 default)。
//
// 用途: /admin/inquiries (加盟店からの問い合わせ一覧 = 他店舗の個人情報含む)
// 等、加盟店 owner に見せてはいけない page / data を gate するために使用。
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.MOCAL_PLATFORM_ADMIN_EMAILS
  if (!raw) return false
  const allowed = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(email.trim().toLowerCase())
}

// Platform admin の session を verify。store owner / staff であっても platform
// admin でなければ `/admin/dashboard` へ redirect (見えてはいけない情報を保護)。
export const verifyPlatformAdminSession = cache(async () => {
  const session = await verifyStoreSession()
  if (!isPlatformAdmin(session.email)) {
    redirect('/admin/dashboard')
  }
  return session
})

// API ルート用: セッション無効時に redirect しない代わりに null を返す
// 本流の getSessionPayload と同じ用途（401 を返したい場合に使う）
export const getStoreSession = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await supabase
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', user.id)
    .single()
  if (!membership) return null
  return {
    userId: user.id,
    email: user.email!,
    storeId: membership.store_id,
    role: membership.role,
  }
})
