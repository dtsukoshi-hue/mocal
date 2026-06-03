import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createServiceClient } from '@/lib/supabase-server'
import OnboardingForm from './_components/OnboardingForm'
import ResumeUI from './_components/ResumeUI'
import AlreadyHasStoresNotice from './_components/AlreadyHasStoresNotice'

// nonce-based CSP（proxy.ts）が機能するよう動的レンダリングを強制
export const dynamic = 'force-dynamic'

// #62 PR-2: Onboarding ページ (server component)
//
// 3 mode:
// 1. 未ログイン: signup form (email + password + 店舗情報)
// 2. ログイン中 (多店舗追加): store 情報のみの form
// 3. resume=1: 確認メール後に店舗作成が失敗した user の再試行 UI
//
// query params:
//   error: slug_taken / expired / invalid_link / server / rate_limit / invite_invalid 等
//   name:  店舗名 prefill 値
//   resume: '1' で resume mode

interface SearchParams {
  error?: string
  resume?: string
  name?: string
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const isLoggedIn = Boolean(user)
  const isResumeRequest = params.resume === '1'

  // ---------- resume mode (ログイン中 + ?resume=1) ----------
  if (isLoggedIn && isResumeRequest) {
    // pending_signups の存在を server side で check
    const service = createServiceClient()
    const { data: pending } = await service
      .from('pending_signups')
      .select('store_name, slug, status, error_count, last_error')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (pending && pending.status !== 'completed') {
      return (
        <ResumeUI
          storeName={pending.store_name}
          slug={pending.slug}
          errorCode={params.error}
          errorCount={pending.error_count}
        />
      )
    }
    // pending なし or 完了済 → 通常 flow に fallback (多店舗追加 form)
  }

  // ---------- ログイン中: 多店舗追加 mode ----------
  if (isLoggedIn) {
    // 既存店舗一覧を取得 (表示用)
    const service = createServiceClient()
    const { data: memberships } = await service
      .from('store_members')
      .select('store_id, role, stores ( name, slug )')
      .eq('user_id', user!.id)

    return (
      <>
        <AlreadyHasStoresNotice
          stores={
            (memberships ?? [])
              .map(m => {
                // store_members.stores は relation で 1 件 (1:1 join)、配列で来る可能性に対応
                const s = Array.isArray(m.stores) ? m.stores[0] : m.stores
                if (!s) return null
                return { name: s.name, slug: s.slug ?? '', role: m.role }
              })
              .filter((x): x is { name: string; slug: string; role: string } => x !== null)
          }
        />
        <OnboardingForm
          mode="add-store"
          errorCode={params.error}
          prefilledName={params.name}
        />
      </>
    )
  }

  // ---------- 未ログイン: 新規 signup mode ----------
  return (
    <OnboardingForm
      mode="new-signup"
      errorCode={params.error}
      prefilledName={params.name}
    />
  )
}
