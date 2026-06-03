'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { isSlugReserved } from '@/lib/slug-reservation'

// #62 PR-2: Onboarding 再設計
//
// 2 mode:
// (A) 未ログイン (新規 signup): signUp → pending_signups 中間状態保存 → 確認メール送信
//     → ユーザがメール内リンク (/auth/confirm) を踏むと store 作成 (RPC)
// (B) ログイン中 (多店舗追加): signUp skip → 直接 store 作成 (RPC)
//
// 設計詳細: docs/onboarding-auth-redesign.md PR-2

export type OnboardingState =
  | undefined
  | { ok: true; mode: 'sent'; email: string }           // (A) 確認メール送信完了
  | { ok: true; mode: 'created'; storeId: string }      // (B) 即店舗作成完了 (redirect 直前)
  | { error: string; field?: 'store_name' | 'slug' | 'email' | 'password' | 'general' }

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mocal.jp'

// メール確認 callback の URL (Supabase Auth の emailRedirectTo に渡す)
const CONFIRM_URL = `${SITE_URL}/auth/confirm`

export async function registerStoreAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  // ---------- rate limit (5 req/min/IP) ----------
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('onboarding-register', ip, 5, 60_000))) {
    return { error: 'リクエストが多すぎます。しばらく時間をおいてからお試しください。', field: 'general' }
  }

  // ---------- form validation ----------
  const storeNameRaw = formData.get('store_name')
  const slugRaw = formData.get('slug')
  const emailRaw = formData.get('email')
  const passwordRaw = formData.get('password')

  if (typeof storeNameRaw !== 'string' || !storeNameRaw.trim()) {
    return { error: '店舗名を入力してください。', field: 'store_name' }
  }
  if (typeof slugRaw !== 'string' || !slugRaw.trim()) {
    return { error: 'URLを入力してください。', field: 'slug' }
  }

  const storeName = storeNameRaw.trim()
  const slug = slugRaw.trim().toLowerCase() // server 側でも正規化 (defense in depth)

  if (!SLUG_RE.test(slug)) {
    return { error: 'URL は英小文字・数字・ハイフンのみ、3〜50文字で入力してください。', field: 'slug' }
  }

  if (isSlugReserved(slug)) {
    return { error: 'このURLは予約語のため使用できません。別のURLを入力してください。', field: 'slug' }
  }

  // ---------- ログイン状態判定 ----------
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user: existingUser } } = await supabaseUser.auth.getUser()
  const service = createServiceClient()

  // ---------- slug 重複事前 check (両 mode 共通) ----------
  // race は RPC 内で 23505 → 'slug_taken' として再 raise。
  // 事前 check は UX 向上目的 (signUp 前に reject)。
  const { data: existingStore, error: slugCheckErr } = await service
    .from('stores')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (slugCheckErr) {
    logger.error('[onboarding] slug 事前 check 失敗', { error: slugCheckErr, slug })
    return { error: '登録処理でエラーが発生しました。しばらく経ってから再試行してください。', field: 'general' }
  }
  if (existingStore) {
    return { error: 'このURLは既に使われています。別のURLを入力してください。', field: 'slug' }
  }

  // ============================================================
  // mode (B): ログイン中 = 多店舗追加 (signUp skip)
  // ============================================================
  if (existingUser) {
    // store 作成のみ
    const { data: storeId, error: rpcErr } = await service.rpc('create_store_with_owner', {
      p_name: storeName,
      p_slug: slug,
      p_user_id: existingUser.id,
    })
    if (rpcErr) {
      const isSlugTaken = rpcErr.code === '23505' || rpcErr.message?.includes('slug_taken')
      if (isSlugTaken) {
        return { error: 'このURLは既に使われています。別のURLを入力してください。', field: 'slug' }
      }
      logger.error('[onboarding] mode=B RPC 失敗', {
        error: rpcErr,
        userId: existingUser.id,
        slug,
        flow: 'onboarding-register-multistore',
      })
      return { error: '店舗の登録に失敗しました。しばらく経ってから再試行してください。', field: 'general' }
    }

    if (typeof storeId !== 'string') {
      logger.error('[onboarding] mode=B RPC 戻り値型不正', { storeId, userId: existingUser.id })
      return { error: '店舗の登録に失敗しました。', field: 'general' }
    }

    redirect(`/admin/settings?welcome=1&store_id=${storeId}`)
  }

  // ============================================================
  // mode (A): 未ログイン = 新規 signup
  // ============================================================

  // password は mode (A) のみ必要
  if (typeof passwordRaw !== 'string' || passwordRaw.length < 8) {
    return { error: 'パスワードは8文字以上で設定してください。', field: 'password' }
  }
  if (typeof emailRaw !== 'string' || !emailRaw.trim()) {
    return { error: 'メールアドレスを入力してください。', field: 'email' }
  }
  const email = emailRaw.trim()
  const password = passwordRaw

  const { data: signUpData, error: signUpErr } = await supabaseUser.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${CONFIRM_URL}?next=/admin/settings`,
    },
  })

  if (signUpErr || !signUpData.user) {
    const status = (signUpErr as { status?: number } | null)?.status
    const msg = signUpErr?.message?.toLowerCase() ?? ''
    if (status === 422 || msg.includes('already registered') || msg.includes('already been registered')) {
      return { error: 'このメールアドレスは既に登録されています。ログインしてから「店舗を追加」してください。', field: 'email' }
    }
    logger.error('[onboarding] signUp 失敗', {
      error: signUpErr,
      flow: 'onboarding-register-new',
      // email は PII のため Sentry には流さない (lib/logger は extra で送るが、
      // sentry.server.config.ts beforeSend で sanitize される前提)
    })
    return { error: '登録に失敗しました。しばらく経ってから再試行してください。', field: 'general' }
  }

  const userId = signUpData.user.id

  // pending_signups UPSERT (user_id UNIQUE で同 user の再 signup を吸収)
  const { error: pendingErr } = await service
    .from('pending_signups')
    .upsert(
      {
        user_id: userId,
        store_name: storeName,
        slug,
        status: 'pending',
        error_count: 0,
        last_error: null,
        completed_at: null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'user_id' }
    )
  if (pendingErr) {
    logger.error('[onboarding] pending_signups UPSERT 失敗', {
      error: pendingErr,
      userId,
      flow: 'onboarding-register-new',
    })
    // auth user は作成済だが pending 行が無い = 確認メール後の callback が動かない。
    // user は再度 /onboarding を試せる (auth user は signUp で「already registered」になるが、
    //   resume=1 経路でログインしてから resume させる代替手段がある)
    return { error: '登録処理でエラーが発生しました。しばらく経ってから再試行してください。', field: 'general' }
  }

  // 成功: 確認メール送信状態
  return { ok: true, mode: 'sent', email }
}

// ============================================================================
// resume 経路: 確認メール後の callback で store 作成が失敗した場合、
// ログイン中 user が /onboarding?resume=1 から再試行
// ============================================================================

export async function resumeStoreCreationAction(
  _prev: OnboardingState,
  _formData: FormData
): Promise<OnboardingState> {
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return { error: 'ログインが必要です。', field: 'general' }
  }

  const service = createServiceClient()
  const { data: pending, error: selectErr } = await service
    .from('pending_signups')
    .select('store_name, slug, status, error_count')
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectErr) {
    logger.error('[onboarding] resume pending_signups SELECT 失敗', { error: selectErr, userId: user.id })
    return { error: '再試行処理でエラーが発生しました。', field: 'general' }
  }
  if (!pending) {
    return { error: '再試行できる登録情報がありません。最初から登録をやり直してください。', field: 'general' }
  }
  if (pending.status === 'completed') {
    // 既に完了済 = 二重実行防止、redirect で UI に遷移
    redirect('/admin/settings?welcome=1')
  }

  // RPC 実行
  const { data: storeId, error: rpcErr } = await service.rpc('create_store_with_owner', {
    p_name: pending.store_name,
    p_slug: pending.slug,
    p_user_id: user.id,
  })

  if (rpcErr) {
    const isSlugTaken = rpcErr.code === '23505' || rpcErr.message?.includes('slug_taken')
    await service
      .from('pending_signups')
      .update({
        error_count: (pending.error_count ?? 0) + 1,
        last_error: isSlugTaken ? 'slug_taken' : (rpcErr.message ?? 'unknown'),
        status: isSlugTaken ? 'pending' : 'failed', // slug_taken は別 slug で再試行可能
      })
      .eq('user_id', user.id)

    if (isSlugTaken) {
      redirect(`/onboarding?error=slug_taken&name=${encodeURIComponent(pending.store_name)}`)
    }
    logger.error('[onboarding] resume RPC 失敗', { error: rpcErr, userId: user.id, flow: 'onboarding-resume' })
    return { error: '店舗の登録に失敗しました。しばらく経ってから再試行してください。', field: 'general' }
  }

  if (typeof storeId !== 'string') {
    logger.error('[onboarding] resume RPC 戻り値型不正', { storeId, userId: user.id })
    return { error: '店舗の登録に失敗しました。', field: 'general' }
  }

  // 成功: pending_signups completed に更新
  await service
    .from('pending_signups')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('user_id', user.id)

  redirect(`/admin/settings?welcome=1&store_id=${storeId}`)
}
