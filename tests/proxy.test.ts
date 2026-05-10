import { describe, it, expect, beforeEach } from 'vitest'
import { proxy } from '@/proxy'
import { createSessionToken } from '@/lib/session'

// proxy.ts は edge ランタイム前提だが、Node 環境でも基本ロジックは動作する。
// in-memory な rate-limit Map はテスト間で共有されるため、IP を毎回変えて衝突を避ける。

let ipCounter = 0
function uniqueIp() {
  ipCounter++
  return `10.0.0.${ipCounter}`
}

function makeRequest(opts: {
  pathname: string
  method?: string
  cookie?: string
  ip?: string
}): Parameters<typeof proxy>[0] {
  const url = new URL(opts.pathname, 'http://localhost')
  const headers = new Headers()
  if (opts.ip) headers.set('x-forwarded-for', opts.ip)
  if (opts.cookie) headers.set('cookie', `admin_session=${opts.cookie}`)
  return {
    nextUrl: url,
    url: url.toString(),
    method: opts.method ?? 'GET',
    headers,
    cookies: {
      get: (name: string) => opts.cookie && name === 'admin_session'
        ? { name, value: opts.cookie }
        : undefined,
    },
  } as never
}

beforeEach(() => {
  // setup.ts の SESSION_SECRET が必須
})

describe('proxy', () => {
  describe('admin route protection', () => {
    it('redirects to login when no session', async () => {
      const res = await proxy(makeRequest({ pathname: '/admin/dashboard' }))
      expect(res.status).toBe(307) // redirect
      expect(res.headers.get('location')).toContain('/admin/login')
    })

    it('redirects to login when token is invalid', async () => {
      const res = await proxy(makeRequest({
        pathname: '/admin/dashboard',
        cookie: 'tampered.token',
      }))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/admin/login')
    })

    it('passes through with valid session token', async () => {
      const token = createSessionToken({
        email: 'admin@test.local',
        storeId: '00000000-0000-0000-0000-000000000000',
        role: 'owner',
        exp: Date.now() + 60_000,
      })
      const res = await proxy(makeRequest({
        pathname: '/admin/dashboard',
        cookie: token,
      }))
      // .next() returns a NextResponse with 200 by default; no redirect location
      expect(res.headers.get('location')).toBeNull()
    })

    it('skips auth for /admin/login path', async () => {
      const res = await proxy(makeRequest({ pathname: '/admin/login' }))
      expect(res.headers.get('location')).toBeNull()
    })

    it('does not protect non-admin paths', async () => {
      const res = await proxy(makeRequest({ pathname: '/orders/abc' }))
      expect(res.headers.get('location')).toBeNull()
    })
  })

  describe('Content Security Policy', () => {
    it('sets CSP header on page requests', async () => {
      const res = await proxy(makeRequest({ pathname: '/' }))
      const csp = res.headers.get('content-security-policy')
      expect(csp).not.toBeNull()
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("nonce-")
      expect(csp).toContain("'strict-dynamic'")
      expect(csp).toContain("frame-ancestors 'none'")
    })

    it('does not set CSP header on API requests', async () => {
      const res = await proxy(makeRequest({ pathname: '/api/health' }))
      expect(res.headers.get('content-security-policy')).toBeNull()
    })

    it('does not set CSP header on _next/static requests', async () => {
      const res = await proxy(makeRequest({ pathname: '/_next/static/chunks/main.js' }))
      expect(res.headers.get('content-security-policy')).toBeNull()
    })

    it('sets CSP on /admin/login (no auth required)', async () => {
      const res = await proxy(makeRequest({ pathname: '/admin/login' }))
      const csp = res.headers.get('content-security-policy')
      expect(csp).not.toBeNull()
    })
  })

  describe('rate limiting', () => {
    it('returns 429 after 5 login POSTs from same IP', async () => {
      const ip = uniqueIp()
      // 1〜5 回目は通る
      for (let i = 0; i < 5; i++) {
        const res = await proxy(makeRequest({
          pathname: '/api/auth/login',
          method: 'POST',
          ip,
        }))
        expect(res.status).not.toBe(429)
      }
      // 6 回目は 429
      const blocked = await proxy(makeRequest({
        pathname: '/api/auth/login',
        method: 'POST',
        ip,
      }))
      expect(blocked.status).toBe(429)
    })

    it('does not rate-limit GET to login endpoint', async () => {
      const ip = uniqueIp()
      for (let i = 0; i < 10; i++) {
        const res = await proxy(makeRequest({
          pathname: '/api/auth/login',
          method: 'GET',
          ip,
        }))
        expect(res.status).not.toBe(429)
      }
    })

    it('returns 429 after 30 PATCH /api/orders/* from same IP', async () => {
      const ip = uniqueIp()
      for (let i = 0; i < 30; i++) {
        await proxy(makeRequest({
          pathname: '/api/orders/abc',
          method: 'PATCH',
          ip,
        }))
      }
      const blocked = await proxy(makeRequest({
        pathname: '/api/orders/abc',
        method: 'PATCH',
        ip,
      }))
      expect(blocked.status).toBe(429)
    })

    it('separates rate limit by IP', async () => {
      const ipA = uniqueIp()
      const ipB = uniqueIp()
      for (let i = 0; i < 5; i++) {
        await proxy(makeRequest({ pathname: '/api/auth/login', method: 'POST', ip: ipA }))
      }
      // ipA は次は 429、ipB はまだ通る
      const blockedA = await proxy(makeRequest({ pathname: '/api/auth/login', method: 'POST', ip: ipA }))
      expect(blockedA.status).toBe(429)
      const passB = await proxy(makeRequest({ pathname: '/api/auth/login', method: 'POST', ip: ipB }))
      expect(passB.status).not.toBe(429)
    })
  })
})
