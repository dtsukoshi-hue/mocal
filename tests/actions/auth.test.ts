import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: () => '127.0.0.1' })),
  cookies: vi.fn(() => Promise.resolve({
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // Next.js の redirect は throw する（テスト用に同じ振る舞い）
    throw new Error(`__redirect__:${url}`)
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  checkRateLimitAsync: vi.fn(async () => true),
}))

import { loginAction, logoutAction } from '@/app/actions/auth'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ADMIN_EMAIL = 'admin@test.local'
  process.env.ADMIN_PASSWORD = 'test-password'
  process.env.ADMIN_STORE_ID = '00000000-0000-0000-0000-000000000000'
  process.env.SESSION_SECRET = 'test-secret-for-vitest-only'
})

describe('loginAction', () => {
  it('returns error when fields missing', async () => {
    const r = await loginAction(undefined, fd({}))
    expect(r).toMatchObject({ error: expect.stringContaining('入力') })
  })

  it('returns error on wrong email', async () => {
    const r = await loginAction(undefined, fd({ email: 'wrong@x.com', password: 'test-password' }))
    expect(r).toMatchObject({ error: expect.any(String) })
    // 情報漏洩していないこと
    if (r && 'error' in r) {
      expect(r.error).not.toMatch(/email/)
      expect(r.error).not.toMatch(/length/)
    }
  })

  it('returns error on wrong password', async () => {
    const r = await loginAction(undefined, fd({ email: 'admin@test.local', password: 'bad' }))
    expect(r).toMatchObject({ error: expect.any(String) })
    if (r && 'error' in r) {
      expect(r.error).not.toMatch(/length/)
    }
  })

  it('returns rate limit error when rl blocks', async () => {
    const rl = await import('@/lib/rate-limit')
    vi.mocked(rl.checkRateLimitAsync).mockResolvedValueOnce(false)
    const r = await loginAction(undefined, fd({ email: 'admin@test.local', password: 'test-password' }))
    expect(r).toMatchObject({ error: expect.stringContaining('リクエストが多すぎます') })
  })

  it('returns error when env not configured', async () => {
    delete process.env.ADMIN_EMAIL
    const r = await loginAction(undefined, fd({ email: 'admin@test.local', password: 'test-password' }))
    expect(r).toMatchObject({ error: '認証に失敗しました。' })
  })

  it('redirects to dashboard on success', async () => {
    await expect(
      loginAction(undefined, fd({ email: 'admin@test.local', password: 'test-password' }))
    ).rejects.toThrow('__redirect__:/admin/dashboard')
  })
})

describe('logoutAction', () => {
  it('redirects to login', async () => {
    await expect(logoutAction()).rejects.toThrow('__redirect__:/admin/login')
  })
})
