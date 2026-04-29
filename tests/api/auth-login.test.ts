import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({
    get: () => '127.0.0.1',
  })),
}))

// rate-limit はテスト間で干渉しないように常時許可
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
  checkRateLimitAsync: vi.fn(async () => true),
}))

vi.mock('@/lib/staff-auth', () => ({
  authenticateStaff: vi.fn(async () => null),
}))

import { POST } from '@/app/api/auth/login/route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  // setup.ts で固定値が入っている前提
  process.env.ADMIN_EMAIL = 'admin@test.local'
  process.env.ADMIN_PASSWORD = 'test-password'
  process.env.ADMIN_STORE_ID = '00000000-0000-0000-0000-000000000000'
  process.env.SESSION_SECRET = 'test-secret-for-vitest-only'
})

describe('POST /api/auth/login', () => {
  it('returns 400 on invalid JSON', async () => {
    const res = await POST(makeReq('not json{') as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when fields are missing', async () => {
    const res = await POST(makeReq({}) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when fields are wrong types', async () => {
    const res = await POST(makeReq({ email: 123, password: true }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 401 on wrong email', async () => {
    const res = await POST(makeReq({ email: 'wrong@example.com', password: 'test-password' }) as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    // エラーメッセージから情報漏洩していないことを確認
    expect(body.error).not.toMatch(/email/)
    expect(body.error).not.toMatch(/length/)
    expect(body.error).not.toMatch(/=/)
  })

  it('returns 401 on wrong password', async () => {
    const res = await POST(makeReq({ email: 'admin@test.local', password: 'wrong' }) as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).not.toMatch(/length/)
  })

  it('returns 401 on different-length wrong password (no timing leak in response)', async () => {
    // タイミング攻撃対策の動作確認は難しいが、レスポンスが同じ形式であることをチェック
    const res = await POST(makeReq({ email: 'admin@test.local', password: 'a' }) as never)
    expect(res.status).toBe(401)
  })

  it('issues a session cookie on success', async () => {
    const res = await POST(makeReq({ email: 'admin@test.local', password: 'test-password' }) as never)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/admin_session=/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).toMatch(/Path=\//)
  })

  it('returns 500 when env not configured', async () => {
    delete process.env.ADMIN_EMAIL
    const res = await POST(makeReq({ email: 'admin@test.local', password: 'test-password' }) as never)
    expect(res.status).toBe(500)
  })

  it('returns 429 when rate-limited', async () => {
    const rl = await import('@/lib/rate-limit')
    vi.mocked(rl.checkRateLimitAsync).mockResolvedValueOnce(false)
    const res = await POST(makeReq({ email: 'admin@test.local', password: 'test-password' }) as never)
    expect(res.status).toBe(429)
  })
})
