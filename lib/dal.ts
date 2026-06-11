import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase-ssr'

// ============================================================
// 設計原則: 全 security check は **fail-closed**
//
// Supabase API call (auth.getUser / from(...).single() / mfa.* 等) が
// network 障害 / 503 / timeout で `{ data: null, error: Error }` を返した時、
// security check を silent に skip しないこと。
//
// 必ず `const { data, error } = await call()` で error も分割代入し、
// `if (error || !data) redirect('/admin/login')` で safe 側に倒す。
//
// 規制要件: Stripe 申告書 §1 二段階認証要件、加盟店データ分離の保証。
// 詳細経緯: PR #80 (2026-06-11) MFA fail-open 修正と同じ pattern。
// ============================================================

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

  // MFA AAL enforcement (fail-closed)
  if (!opts?.skipMfaCheck) {
    const { data: aalData, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    // fail-closed: Supabase 一時障害 / network エラー時に MFA 強制を skip しない。
    // session 再取得 (= /admin/login への redirect) で safe 側に倒す。
    // Stripe 申告書 §1「二段階認証または二要素認証を採用する」の運用適合のため。
    if (aalError || !aalData) {
      redirect('/admin/login')
    }
    // currentLevel: 現在の session の AAL ('aal1' | 'aal2')
    // nextLevel: user の factor が要求する最高 AAL
    // nextLevel='aal2' なら user は MFA enroll 済 = challenge 必須
    if (aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
      redirect('/admin/mfa-challenge')
    }
  }

  // 所属店舗を取得 (fail-closed: error / data=null で /admin/login へ)
  const { data: membership, error: membershipError } = await supabase
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', user.id)
    .single()

  if (membershipError || !membership) {
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
// fail-closed: getUser の error 時も null を返す (= 未認証扱い)。
export const getSession = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) return null
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
// fail-closed: getUser / membership query の error 時も null を返す
// (caller が 401 を返すことで safe 側に倒れる)。
export const getStoreSession = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return null
  const { data: membership, error: membershipError } = await supabase
    .from('store_members')
    .select('store_id, role')
    .eq('user_id', user.id)
    .single()
  if (membershipError || !membership) return null
  return {
    userId: user.id,
    email: user.email!,
    storeId: membership.store_id,
    role: membership.role,
  }
})
