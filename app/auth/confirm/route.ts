import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createServiceClient } from '@/lib/supabase-server'
import { checkRateLimitAsync } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { headers } from 'next/headers'

// #62 PR-2 + hotfix: 確認メール (signup / invite / recovery) クリック後の callback
//
// 2 種類のメールリンク経路を受け付ける:
//
// (A) Token Hash 経路 (推奨、PR-2 hotfix 後の email template はこちらを使用):
//     URL: `<SiteURL>/auth/confirm?token_hash=...&type=signup&next=...`
//     → supabase.auth.verifyOtp({ token_hash, type }) で session 確立
//
// (B) PKCE Code 経路 (Supabase の verify endpoint を経由する legacy 経路、
//     {{ .ConfirmationURL }} を template に使うと自動でこの形式に):
//     URL: `<SiteURL>/auth/confirm?code=...&next=...` (Supabase verify からの redirect)
//     → supabase.auth.exchangeCodeForSession(code) で session 確立
//
// どちらの経路でも session 確立後の処理 (pending_signups SELECT + RPC) は共通。
//
// 設計詳細: docs/onboarding-auth-redesign.md PR-2

const ONBOARDING_PATH = '/onboarding'
const DEFAULT_NEXT = '/admin/settings?welcome=1'

type EmailType = 'signup' | 'invite' | 'recovery' | 'email_change' | 'magiclink'

// Supabase が返す可能性のある「token expired」相当のエラーコード。fallback は invalid_link。
const EXPIRED_CODES = new Set(['otp_expired', 'token_expired', 'invalid_grant'])

function isExpiredError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code && EXPIRED_CODES.has(err.code)) return true
  const msg = err.message?.toLowerCase() ?? ''
  return msg.includes('expired') || msg.includes('invalid grant')
}

/**
 * `next` query param を同一 origin の relative path のみに正規化する。
 *
 * 監査 2026-06-08 #5: `new URL(next, req.url)` は絶対URL (https://evil.com) を
 * 優先するため、攻撃者が valid token + next=外部URL を組み合わせて session
 * fixation + open redirect を仕掛けられた。
 *
 * 仕様:
 * - `/` で始まり、`//` (protocol-relative) では始まらない値のみ許可
 * - それ以外 (`https://evil.com`, `javascript:...`, 空文字 等) は DEFAULT_NEXT に fallback
 */
export function sanitizeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT
  if (!raw.startsWith('/')) return DEFAULT_NEXT
  if (raw.startsWith('//')) return DEFAULT_NEXT
  // backslash も blocking (一部ブラウザで / と解釈される historical bug 対策)
  if (raw.startsWith('/\\') || raw.startsWith('\\')) return DEFAULT_NEXT
  return raw
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash')
  const code = url.searchParams.get('code')
  const type = url.searchParams.get('type') as EmailType | null
  const next = sanitizeNext(url.searchParams.get('next'))

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

  const supabase = await createSupabaseServerClient()

  // ============================================================
  // 経路 (B): PKCE Code (Supabase verify endpoint からの redirect)
  // ============================================================
  if (code) {
    const { data: exchangeData, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(code)

    if (exchangeErr || !exchangeData.session?.user) {
      logger.warn('[auth/confirm] exchangeCodeForSession 失敗', {
        code: exchangeErr?.code,
        status: exchangeErr?.status,
        flow: 'onboarding-confirm',
      })
      const errorCode = isExpiredError(exchangeErr) ? 'expired' : 'invalid_link'
      return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=${errorCode}`, req.url)))
    }

    // PKCE 経路では type が URL に含まれないため、pending_signups の有無で
    // signup フローか否かを判定する。signup でなければ /admin/dashboard fallback。
    return handlePostVerify(req, exchangeData.session.user.id, next, noStore)
  }

  // ============================================================
  // 経路 (A): Token Hash (SSR 推奨)
  // ============================================================
  if (!tokenHash || !type) {
    logger.warn('[auth/confirm] パラメータ不足', {
      hasToken: Boolean(tokenHash),
      hasCode: Boolean(code),
      type,
    })
    return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=invalid_link`, req.url)))
  }

  if (type === 'signup') {
    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'signup',
    })
    if (verifyErr || !verifyData.user) {
      logger.warn('[auth/confirm] signup verifyOtp 失敗', {
        code: verifyErr?.code,
        status: verifyErr?.status,
        flow: 'onboarding-confirm',
      })
      const errorCode = isExpiredError(verifyErr) ? 'expired' : 'invalid_link'
      return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=${errorCode}`, req.url)))
    }
    return handlePostVerify(req, verifyData.user.id, next, noStore)
  }

  if (type === 'invite') {
    // PR-4 で本実装、本 PR では verifyOtp + redirect のみ
    const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
    if (verifyErr) {
      logger.warn('[auth/confirm] invite verifyOtp 失敗', { code: verifyErr.code, status: verifyErr.status })
      return noStore(NextResponse.redirect(new URL(`${ONBOARDING_PATH}?error=invite_invalid`, req.url)))
    }
    return noStore(NextResponse.redirect(new URL('/admin/dashboard', req.url)))
  }

  if (type === 'recovery') {
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

// ----------------------------------------------------------------------------
// 経路 (A)(B) 共通: session 確立後の signup 処理
//   - pending_signups 行を確認 → create_store_with_owner RPC → next へ redirect
//   - pending 行が無い場合は signup 経由ではない (PKCE で invite 等) → /admin/dashboard fallback
// ----------------------------------------------------------------------------
async function handlePostVerify(
  req: NextRequest,
  userId: string,
  next: string,
  noStore: (res: NextResponse) => NextResponse
): Promise<NextResponse> {
  const service = createServiceClient()

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
    // signup 経由ではない (PKCE 経路で invite 等を受けた場合の fallback)。
    // session は確立済なので dashboard へ。
    logger.info('[auth/confirm] pending_signups 行なし → dashboard fallback', {
      userId,
      flow: 'onboarding-confirm',
    })
    return noStore(NextResponse.redirect(new URL('/admin/dashboard', req.url)))
  }

  if (pending.status === 'completed') {
    // 二重クリック等、idempotent に next へ redirect
    return noStore(NextResponse.redirect(new URL(next, req.url)))
  }

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
