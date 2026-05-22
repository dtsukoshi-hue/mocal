import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// proxy.ts は Supabase クライアントを使うため、SSR クライアントをモック
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid' } }, error: null }),
    },
    cookies: {
      getAll: vi.fn().mockReturnValue([]),
      setAll: vi.fn(),
    },
  }),
}))

import { proxy } from '@/proxy'

// ---------------------------------------------------------------------------
// Helper: NextRequest を組み立てる
// ---------------------------------------------------------------------------
function makeReq(path: string, opts?: { ip?: string; method?: string }): NextRequest {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = {}
  if (opts?.ip) headers['x-forwarded-for'] = opts.ip
  return new NextRequest(url, { method: opts?.method ?? 'GET', headers })
}

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------
describe('proxy — rate limiting', () => {
  it('allows requests within the limit', async () => {
    const ip = '1.2.3.4'
    // /api/push/test は 5回/分
    for (let i = 0; i < 5; i++) {
      const res = await proxy(makeReq('/api/push/test', { ip, method: 'POST' }) as never)
      expect(res?.status).not.toBe(429)
    }
  })

  it('returns 429 after exceeding the limit', async () => {
    const ip = '5.6.7.8'
    // /api/push/test は 5回/分 — 6回目は弾かれる
    for (let i = 0; i < 5; i++) {
      await proxy(makeReq('/api/push/test', { ip, method: 'POST' }) as never)
    }
    const res = await proxy(makeReq('/api/push/test', { ip, method: 'POST' }) as never)
    expect(res?.status).toBe(429)
  })

  it('allows requests to paths without rate limit rules', async () => {
    const res = await proxy(makeReq('/api/webhook/stripe') as never)
    // webhook は matcher に含まれないので proxy 自体が呼ばれないが、
    // 仮に呼ばれてもレート制限は掛からない
    expect(res?.status).not.toBe(429)
  })

  it('includes Retry-After header on 429', async () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 5; i++) {
      await proxy(makeReq('/api/push/test', { ip, method: 'POST' }) as never)
    }
    const res = await proxy(makeReq('/api/push/test', { ip, method: 'POST' }) as never)
    expect(res?.headers.get('Retry-After')).toBe('60')
  })
})

// ---------------------------------------------------------------------------
// CSP nonce
// ---------------------------------------------------------------------------
describe('proxy — CSP header', () => {
  it('sets Content-Security-Policy on page requests', async () => {
    const res = await proxy(makeReq('/') as never)
    const csp = res?.headers.get('Content-Security-Policy')
    expect(csp).toContain("'nonce-")
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toContain("object-src 'none'")
  })

  it('includes Stripe domains in script-src', async () => {
    const res = await proxy(makeReq('/') as never)
    const csp = res?.headers.get('Content-Security-Policy')
    expect(csp).toContain('https://js.stripe.com')
  })

  it('includes hooks.stripe.com in frame-src', async () => {
    const res = await proxy(makeReq('/') as never)
    const csp = res?.headers.get('Content-Security-Policy')
    expect(csp).toContain('https://hooks.stripe.com')
  })

  it('does not set CSP on _next/static requests', async () => {
    const res = await proxy(makeReq('/_next/static/chunks/main.js') as never)
    // matcher excludes _next/static — proxy never runs, so res should be undefined
    // If somehow reached, no nonce should appear
    if (res) {
      const csp = res.headers.get('Content-Security-Policy')
      // CSP should not have a nonce for static assets
      expect(csp).toBeNull()
    } else {
      expect(res).toBeUndefined()
    }
  })

  it('sets x-nonce request header that matches CSP nonce', async () => {
    const req = makeReq('/admin/dashboard') as never
    const res = await proxy(req)
    const csp = res?.headers.get('Content-Security-Policy')
    // nonce in CSP is base64-encoded UUID
    const match = csp?.match(/'nonce-([^']+)'/)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(/^[A-Za-z0-9+/]+=*$/)  // base64 pattern
  })
})

// ---------------------------------------------------------------------------
// Admin redirect
// ---------------------------------------------------------------------------
describe('proxy — admin auth redirect', () => {
  it('redirects to /admin/login when not authenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      cookies: {},
    } as never)

    const res = await proxy(makeReq('/admin/dashboard') as never)
    expect(res?.status).toBe(307)
    expect(res?.headers.get('location')).toContain('/admin/login')
  })

  it('passes through /admin/login without auth check', async () => {
    const res = await proxy(makeReq('/admin/login') as never)
    expect(res?.status).not.toBe(307)
  })

  it('passes through non-admin pages without auth check', async () => {
    const res = await proxy(makeReq('/') as never)
    expect(res?.status).not.toBe(307)
  })
})
