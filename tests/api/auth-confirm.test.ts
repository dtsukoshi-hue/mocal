/**
 * #62 PR-2: GET /auth/confirm のテスト
 *
 * verifyOtp + pending_signups + create_store_with_owner RPC の統合 flow を mock で検証。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const supabaseSsrMock = vi.hoisted(() => ({
  auth: {
    verifyOtp: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getUser: vi.fn(),
  },
}))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseSsrMock),
}))

const supabaseServiceMock = vi.hoisted(() => {
  const handlers: Record<string, () => unknown> = {}
  const rpc = vi.fn()
  return {
    handlers,
    rpc,
    from: vi.fn((table: string) => {
      const fn = handlers[table]
      if (!fn) throw new Error(`unexpected from(${table})`)
      return fn()
    }),
  }
})

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => supabaseServiceMock),
}))

const checkRateLimitMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: checkRateLimitMock,
}))

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: loggerMock }))

const headersMock = vi.hoisted(() => ({
  get: vi.fn(() => '203.0.113.1'),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(headersMock),
}))

import { GET } from '@/app/auth/confirm/route'

const APP_URL = 'http://localhost:3000'

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL(`${APP_URL}/auth/confirm`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function setupPendingSelect(pending: unknown, error: unknown = null) {
  supabaseServiceMock.handlers['pending_signups'] = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: pending, error }),
      }),
    }),
    update: () => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(supabaseServiceMock.handlers).forEach(k => delete supabaseServiceMock.handlers[k])
  checkRateLimitMock.mockResolvedValue(true)
})

// ============================================================================
// 入力 validation / rate limit
// ============================================================================

describe('GET /auth/confirm — input', () => {
  it('token_hash 欠落 → /onboarding?error=invalid_link', async () => {
    const res = await GET(makeReq({ type: 'signup' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('type 欠落 → /onboarding?error=invalid_link', async () => {
    const res = await GET(makeReq({ token_hash: 'xxx' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
  })

  it('rate limit 超過 → /onboarding?error=rate_limit', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false)
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding?error=rate_limit')
  })
})

// ============================================================================
// type=signup happy / error paths
// ============================================================================

describe('GET /auth/confirm — type=signup', () => {
  it('verifyOtp 失敗 (expired) → /onboarding?error=expired', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'otp_expired', status: 403, message: 'expired' },
    })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/onboarding?error=expired')
  })

  it('verifyOtp 失敗 (invalid) → /onboarding?error=invalid_link', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'invalid_token', status: 401, message: 'invalid' },
    })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
  })

  it('pending_signups 行なし → /admin/dashboard へフォールバック (session 確立済のため)', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    setupPendingSelect(null)
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.headers.get('location')).toContain('/admin/dashboard')
  })

  it('pending status=completed → idempotent: next にそのまま redirect', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    setupPendingSelect({ store_name: 'X', slug: 'x', status: 'completed', error_count: 0 })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup', next: '/admin/settings' }))
    expect(res.headers.get('location')).toContain('/admin/settings')
    expect(supabaseServiceMock.rpc).not.toHaveBeenCalled()
  })

  it('正常系: RPC 成功 → next にリダイレクト', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    setupPendingSelect({ store_name: 'Mocal Cafe', slug: 'mocal-cafe', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({ data: 'store-123', error: null })

    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup', next: '/admin/settings?welcome=1' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/settings?welcome=1')

    expect(supabaseServiceMock.rpc).toHaveBeenCalledWith('create_store_with_owner', {
      p_name: 'Mocal Cafe',
      p_slug: 'mocal-cafe',
      p_user_id: 'u1',
    })
  })

  it('RPC slug_taken (race) → /onboarding?error=slug_taken&name=...', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    setupPendingSelect({ store_name: '私のカフェ', slug: 'taken-slug', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'slug_taken' },
    })

    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.headers.get('location')).toMatch(/\/onboarding\?error=slug_taken&name=/)
  })

  it('RPC 予期せぬエラー → /onboarding?error=server&resume=1 + Sentry', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    setupPendingSelect({ store_name: 'X', slug: 'x', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const res = await GET(makeReq({ token_hash: 'xxx', type: 'signup' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=server&resume=1')
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('Cache-Control: no-store が必ず設定される', async () => {
    const res = await GET(makeReq({}))
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})

// ============================================================================
// type=invite / recovery / その他
// ============================================================================

describe('GET /auth/confirm — type=invite', () => {
  it('verifyOtp 成功 → /admin/dashboard (PR-4 で詳細実装)', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'invite' }))
    expect(res.headers.get('location')).toContain('/admin/dashboard')
  })

  it('verifyOtp 失敗 → /onboarding?error=invite_invalid', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'invalid', status: 401 },
    })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'invite' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=invite_invalid')
  })
})

describe('GET /auth/confirm — type=recovery', () => {
  it('verifyOtp 成功 → /admin/reset-password', async () => {
    supabaseSsrMock.auth.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    })
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'recovery' }))
    expect(res.headers.get('location')).toContain('/admin/reset-password')
  })
})

describe('GET /auth/confirm — 未対応 type', () => {
  it('email_change → /onboarding?error=invalid_link', async () => {
    const res = await GET(makeReq({ token_hash: 'xxx', type: 'email_change' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
  })
})

// ============================================================================
// PKCE Code 経路 (hotfix で追加: Supabase verify endpoint からの redirect 経由)
// ============================================================================

describe('GET /auth/confirm — PKCE code 経路', () => {
  it('?code= 付与時は exchangeCodeForSession → pending_signups + RPC で signup 完了', async () => {
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u-pkce-1' } } },
      error: null,
    })
    setupPendingSelect({ store_name: 'Mocal', slug: 'mocal', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({ data: 'store-pkce-1', error: null })

    const res = await GET(makeReq({ code: 'auth-code-xxx', next: '/admin/settings?welcome=1' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/settings?welcome=1')
    expect(supabaseSsrMock.auth.exchangeCodeForSession).toHaveBeenCalledWith('auth-code-xxx')
    expect(supabaseServiceMock.rpc).toHaveBeenCalledWith('create_store_with_owner', {
      p_name: 'Mocal',
      p_slug: 'mocal',
      p_user_id: 'u-pkce-1',
    })
  })

  it('exchangeCodeForSession 失敗 (otp_expired) → /onboarding?error=expired', async () => {
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null }, error: { code: 'otp_expired', status: 403 },
    })
    const res = await GET(makeReq({ code: 'expired-code' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=expired')
  })

  it('exchangeCodeForSession 失敗 (invalid_grant = expired 扱い) → /onboarding?error=expired', async () => {
    // PKCE auth code は invalid_grant で expired を表すため expired UI を返す
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null }, error: { code: 'invalid_grant', status: 400 },
    })
    const res = await GET(makeReq({ code: 'invalid-code' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=expired')
  })

  it('exchangeCodeForSession 失敗 (code/message 不明) → /onboarding?error=invalid_link (fallback)', async () => {
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null }, error: { code: 'something_unknown', status: 500, message: 'oops' },
    })
    const res = await GET(makeReq({ code: 'bad-code' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
  })

  it('code 経路で pending_signups 行なし → /admin/dashboard へフォールバック (session 確立済)', async () => {
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u-pkce-2' } } },
      error: null,
    })
    setupPendingSelect(null)
    const res = await GET(makeReq({ code: 'xxx' }))
    expect(res.headers.get('location')).toContain('/admin/dashboard')
  })

  it('code 経路で session.user が無い (異常) → /onboarding?error=invalid_link', async () => {
    supabaseSsrMock.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null }, error: null,
    })
    const res = await GET(makeReq({ code: 'xxx' }))
    expect(res.headers.get('location')).toContain('/onboarding?error=invalid_link')
  })
})
