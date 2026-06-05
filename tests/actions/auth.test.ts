/**
 * #63 PR-3: loginAction + resetPasswordAction のテスト
 *
 * 主に rate limit / lockout / Sentry 経路を検証。
 * signInWithPassword / resetPasswordForEmail は mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// hoisted mocks
// ---------------------------------------------------------------------------

const authSignInMock = vi.hoisted(() => vi.fn())
const authResetMock = vi.hoisted(() => vi.fn())
const authSignOutMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: authSignInMock,
      resetPasswordForEmail: authResetMock,
      signOut: authSignOutMock,
    },
  })),
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
  get: vi.fn(() => '203.0.113.42'),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(headersMock),
}))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const err: Error & { __redirect?: string } = new Error(`REDIRECT:${url}`)
    err.__redirect = url
    throw err
  })
)
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import { loginAction, resetPasswordAction, logoutAction } from '@/app/actions/auth'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue(true) // 既定: 全て許可
  authSignInMock.mockResolvedValue({ error: null })
  authResetMock.mockResolvedValue({ error: null })
  authSignOutMock.mockResolvedValue(undefined)
})

// ============================================================================
// loginAction
// ============================================================================

describe('loginAction: input validation', () => {
  it('email/password 欠落 → error', async () => {
    const res = await loginAction(undefined, fd({}))
    expect(res).toMatchObject({ error: expect.stringContaining('入力') })
  })

  it('email が空文字 → error', async () => {
    const res = await loginAction(undefined, fd({ email: '', password: 'pw' }))
    expect(res).toMatchObject({ error: expect.stringContaining('入力') })
  })
})

describe('loginAction: IP rate limit', () => {
  it('IP rate limit 超過 → 一般エラー (lockout とは異なる文言)', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false) // login-ip
    const res = await loginAction(undefined, fd({ email: 'a@b.jp', password: 'pw' }))
    expect(res).toMatchObject({ error: expect.stringContaining('リクエストが多すぎ') })
    expect(authSignInMock).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('IP rate limit'),
      expect.objectContaining({ flow: 'auth-login' })
    )
  })
})

describe('loginAction: happy path', () => {
  it('正しい credential → /admin/dashboard へ redirect', async () => {
    await expect(
      loginAction(undefined, fd({ email: 'OWNER@MOCAL.JP', password: 'correct' }))
    ).rejects.toThrow('REDIRECT:/admin/dashboard')

    // email は trim + lowercase で normalize されている
    expect(authSignInMock).toHaveBeenCalledWith({
      email: 'owner@mocal.jp',
      password: 'correct',
    })
  })
})

describe('loginAction: 認証失敗', () => {
  it('failed login → 通常エラー文言 (lockout 未到達)', async () => {
    authSignInMock.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    // login-ip ok, login-fail-email ok
    checkRateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const res = await loginAction(undefined, fd({ email: 'a@b.jp', password: 'wrong' }))
    expect(res).toMatchObject({ error: 'メールアドレスまたはパスワードが正しくありません。' })
  })

  it('failed login で lockout 閾値到達 → lockout 文言', async () => {
    authSignInMock.mockResolvedValueOnce({ error: { message: 'Invalid' } })
    // login-ip ok, login-fail-email false (= 5+ failures)
    checkRateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const res = await loginAction(undefined, fd({ email: 'a@b.jp', password: 'wrong' }))
    expect(res).toMatchObject({ error: expect.stringContaining('5分後') })
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('lockout'),
      expect.objectContaining({ event: 'lockout', flow: 'auth-login' })
    )
  })

  it('連続失敗カウンタは email 単位 (normalize 後 = 大文字小文字 / 前後空白を無視)', async () => {
    authSignInMock.mockResolvedValue({ error: { message: 'Invalid' } })
    checkRateLimitMock.mockResolvedValue(true) // 全 OK

    await loginAction(undefined, fd({ email: '  USER@example.com ', password: 'wrong' }))

    // 2回目以降の rate limit 呼び出しの identifier が小文字 trim 済か
    expect(checkRateLimitMock).toHaveBeenCalledWith('login-fail-email', 'user@example.com', 5, 5 * 60_000)
  })
})

// ============================================================================
// logoutAction
// ============================================================================

describe('logoutAction', () => {
  it('signOut + /admin/login へ redirect', async () => {
    await expect(logoutAction()).rejects.toThrow('REDIRECT:/admin/login')
    expect(authSignOutMock).toHaveBeenCalled()
  })
})

// ============================================================================
// resetPasswordAction
// ============================================================================

describe('resetPasswordAction: input validation', () => {
  it('email 欠落 → error', async () => {
    const res = await resetPasswordAction(undefined, fd({}))
    expect(res).toMatchObject({ error: expect.stringContaining('入力') })
  })
})

describe('resetPasswordAction: rate limit (enumeration 防止)', () => {
  it('IP rate limit 超過 → success を装う (情報漏洩しない)', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false) // reset-ip
    const res = await resetPasswordAction(undefined, fd({ email: 'a@b.jp' }))
    expect(res).toEqual({ success: true })
    expect(authResetMock).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('IP rate limit'),
      expect.objectContaining({ flow: 'auth-reset' })
    )
  })

  it('email rate limit 超過 → success を装う', async () => {
    // reset-ip ok, reset-email false
    checkRateLimitMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const res = await resetPasswordAction(undefined, fd({ email: 'a@b.jp' }))
    expect(res).toEqual({ success: true })
    expect(authResetMock).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('email rate limit'),
      expect.objectContaining({ event: 'email_rate_limit', flow: 'auth-reset' })
    )
  })
})

describe('resetPasswordAction: 通常フロー', () => {
  it('正常 → success', async () => {
    const res = await resetPasswordAction(undefined, fd({ email: 'A@MOCAL.JP' }))
    expect(res).toEqual({ success: true })
    // normalize 確認
    expect(authResetMock).toHaveBeenCalledWith('a@mocal.jp', expect.any(Object))
  })

  it('resetPasswordForEmail 失敗 → enumeration 防止のため success を装う + Sentry', async () => {
    authResetMock.mockResolvedValueOnce({ error: { message: 'something failed' } })
    const res = await resetPasswordAction(undefined, fd({ email: 'a@b.jp' }))
    expect(res).toEqual({ success: true })
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('パスワードリセット失敗'),
      expect.objectContaining({ flow: 'auth-reset' })
    )
  })

  it('redirectTo に NEXT_PUBLIC_APP_URL が反映される', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test'
    await resetPasswordAction(undefined, fd({ email: 'a@b.jp' }))
    expect(authResetMock).toHaveBeenCalledWith('a@b.jp', {
      redirectTo: 'https://example.test/admin/reset-password',
    })
    delete process.env.NEXT_PUBLIC_APP_URL
  })
})
