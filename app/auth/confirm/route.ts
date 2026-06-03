import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createServiceClient } from '@/lib/supabase-server'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { headers } from 'next/headers'

// #62 PR-2: 確認メール (signup / invite) クリック後の callback
//
// 流れ (type='signup'):
//   1. verifyOtp({ token_hash, type }) で session 確立 (cookies に set)
//   2. pending_signups から row 取り → create_store_with_owner RPC
//   3. 成功: pending_signups.status='completed' + redirect(next)
//   4. slug_taken: error_count++ + redirect('/onboarding?error=slug_taken&name=...')
//   5. その他: status='failed' + Sentry + redirect('/onboarding?resume=1')
//
// type='invite' は #64 PR-4 で実装。本 PR では fallback redirect。
//
// 設計詳細: docs/onboarding-auth-redesign.md PR-2

const ONBOARDING_PATH = '/onboarding'
const DEFAULT_NEXT = '/admin/settings?welcome=1'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as
    | 'signup' | 'invite' | 'recovery' | 'email_change' | 'magiclink' | null
  const next = url.searchParams.get('next') ?? DEFAULT_NEXT

  // Cache-Control: token を含む URL を絶対にキャッシュさせない
  const noStore = (res: NextResponse) => {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return res
  }

  // ---------- rate limit (token brute force defense in depth) ----------
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!(await checkRateLimitAsync('auth-confirm', ip, 30, 60_000))) {
    logger.warn('[auth/confirm] rate limit 超過', { ip })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=rate_limit`, req.url)))
  }

  // ---------- 入力 validation ----------
  if (!tokenHash || !type) {
    logger.warn('[auth/confirm] パラメータ不足', { hasToken: Boolean(tokenHash), type })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=invalid_link`, req.url)))
  }

  const supabase = await createSupabaseServerClient()

  // ---------- type 別ルーティング ----------
  if (type === 'signup') {
    return handleSignupConfirm(req, supabase, tokenHash, next, noStore)
  }

  if (type === 'invite') {
    // PR-4 で実装予定。本 PR では verifyOtp だけして dashboard に redirect
    const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
    if (verifyErr) {
      logger.warn('[auth/confirm] invite verifyOtp 失敗', { code: verifyErr.code, status: verifyErr.status })
      return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=invite_invalid`, req.url)))
    }
    return noStore(NextResponse.redirect(new URL('/admin/dashboard', req.url)))
  }

  if (type === 'recovery') {
    // password reset: Supabase が `/admin/reset-password` に直接 redirect する設定なので
    // 通常本 route は経由しない。fallback として verifyOtp + redirect
    const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (verifyErr) {
      return noStore(NextResponse.redirect(new URL('/admin/login?error=reset_invalid', req.url)))
    }
    return noStore(NextResponse.redirect(new URL('/admin/reset-password', req.url)))
  }

  // email_change / magiclink 等は本 PR 範囲外
  logger.warn('[auth/confirm] 未対応の type', { type })
  return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=invalid_link`, req.url)))
}

async function handleSignupConfirm(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tokenHash: string,
  next: string,
  noStore: (res: NextResponse) => NextResponse
): Promise<NextResponse> {
  // verifyOtp で session を確立 (cookies に set される)
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'signup',
  })

  if (verifyErr || !verifyData.user) {
    // expired / invalid / already-consumed
    logger.warn('[auth/confirm] signup verifyOtp 失敗', {
      code: verifyErr?.code,
      status: verifyErr?.status,
      flow: 'onboarding-confirm',
    })
    const errorCode = verifyErr?.code === 'otp_expired' ? 'expired' : 'invalid_link'
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=${errorCode}`, req.url)))
  }

  const userId = verifyData.user.id
  const service = createServiceClient()

  // pending_signups 読み取り
  const { data: pending, error: selectErr } = await service
    .from('pending_signups')
    .select('store_name, slug, status, error_count')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectErr) {
    logger.error('[auth/confirm] pending_signups SELECT 失敗', {
      error: selectErr,
      userId,
      flow: 'onboarding-confirm',
    })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=server&resume=1`, req.url)))
  }

  if (!pending) {
    // pending 行なし = onboarding form を経由していない (直接 verifyOtp を踏んだ等)
    // → login page に redirect
    logger.warn('[auth/confirm] pending_signups 行なし', { userId, flow: 'onboarding-confirm' })
    return noStore(NextResponse.redirect(new URL('/admin/login', req.url)))
  }

  if (pending.status === 'completed') {
    // 既に store 作成済 = 二重クリック等。idempotent に next へ redirect
    return noStore(NextResponse.redirect(new URL(next, req.url)))
  }

  // create_store_with_owner RPC
  const { data: storeId, error: rpcErr } = await service.rpc('create_store_with_owner', {
    p_name: pending.store_name,
    p_slug: pending.slug,
    p_user_id: userId,
  })

  if (rpcErr) {
    const isSlugTaken = rpcErr.code === '23505' || rpcErr.message?.includes('slug_taken')

    await service
      .from('pending_signups')
      .update({
        error_count: (pending.error_count ?? 0) + 1,
        last_error: isSlugTaken ? 'slug_taken' : (rpcErr.message ?? 'unknown'),
        // slug_taken は user が別 slug で resume 可能 → status は pending のまま保持
        status: isSlugTaken ? 'pending' : 'failed',
      })
      .eq('user_id', userId)

    if (isSlugTaken) {
      const prefilledName = encodeURIComponent(pending.store_name)
      return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=slug_taken&name=${prefilledName}`, req.url)))
    }

    logger.error('[auth/confirm] create_store_with_owner RPC 失敗', {
      error: rpcErr,
      userId,
      flow: 'onboarding-confirm',
    })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=server&resume=1`, req.url)))
  }

  if (typeof storeId !== 'string') {
    logger.error('[auth/confirm] RPC 戻り値型不正', { storeId, userId, flow: 'onboarding-confirm' })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=server&resume=1`, req.url)))
  }

  // 成功: pending_signups completed
  await service
    .from('pending_signups')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('user_id', userId)

  return noStore(NextResponse.redirect(new URL(next, req.url)))
}
