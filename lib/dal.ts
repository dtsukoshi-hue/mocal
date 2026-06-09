import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase-ssr'

// 店舗メンバーのセッション検証（React render パス内で重複呼び出しをキャッシュ）
//
// MFA enforcement (2026-06-08, Stripe 申告書 §1 二段階認証 採用):
// - user が verified MFA factor を持つ場合、AAL2 を満たさないと
//   /admin/mfa-challenge へ強制 redirect する
// - MFA 未 enroll の user は AAL1 のまま admin にアクセス可 (移行期間)
// - skipMfaCheck=true で /admin/mfa-challenge 自身からの再帰 redirect を回避
export const verifyStoreSession = cache(async (opts?: { skipMfaCheck?: boolean }) => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/admin/login')
  }

  // MFA AAL enforcement
  if (!opts?.skipMfaCheck) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    // currentLevel: 現在の session の AAL ('aal1' | 'aal2')
    // nextLevel: user の factor が要求する最高 AAL
    // currentLevel < nextLevel → 未完了 challenge あり
    if (aalData?.currentLevel && aalData?.nextLevel && aalData.currentLevel !== aalData.nextLevel) {
      redirect('/admin/mfa-challenge')
    }
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
