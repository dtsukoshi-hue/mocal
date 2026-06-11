import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import MfaChallengeForm from './_components/MfaChallengeForm'

export const metadata: Metadata = {
  title: '二段階認証 | mocal',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * MFA challenge page.
 *
 * loginAction で signInWithPassword 成功後、user が verified TOTP factor を
 * 持つ場合に redirect されてくる。
 *
 * 設計:
 * - session 確立済 (AAL1) を前提とする。未認証なら /admin/login へ
 * - factor が無ければ MFA 不要なので /admin/dashboard へ素通し
 * - AAL2 既達なら challenge 完了済なので /admin/dashboard へ
 *
 * lib/dal.ts の verifyStoreSession から無限 redirect を防ぐため、
 * このページからは verifyStoreSession を直接呼ばず手動で確認する。
 */
export default async function MfaChallengePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  // 既に AAL2 達成済なら dashboard へ。エラーは fail-closed (再 login へ)。
  const { data: aalData, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError || !aalData) {
    redirect('/admin/login')
  }
  if (aalData.currentLevel === aalData.nextLevel) {
    redirect('/admin/dashboard')
  }

  // user の verified factors を取得 (data.totp は verified のみ含む)。
  // listFactors の error も fail-closed (再 login へ)。これを silent に
  // dashboard へ素通しすると MFA enforcement bypass になるため。
  const { data: factorsData, error: factorsError } =
    await supabase.auth.mfa.listFactors()
  if (factorsError || !factorsData) {
    redirect('/admin/login')
  }
  const totp = factorsData.totp?.[0]

  if (!totp) {
    // factor 無し = MFA 不要 (post-login challenge 不要)
    redirect('/admin/dashboard')
  }

  return <MfaChallengeForm factorId={totp.id} />
}
