import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/dal', () => ({
  verifyStoreSession: vi.fn(),
}))

import { GET } from '@/app/api/onboarding/stripe/connect/route'
import { verifyStoreSession } from '@/lib/dal'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_ID = '11111111-1111-4111-8111-111111111111'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyStoreSession).mockResolvedValue({
    userId:  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email:   'owner@test.com',
    storeId: STORE_ID,
    role:    'owner',
  } as never)
  process.env.STRIPE_CLIENT_ID = 'ca_test_client'
})

afterEach(() => {
  delete process.env.STRIPE_CLIENT_ID
})

describe('GET /api/onboarding/stripe/connect — missing env', () => {
  it('returns 500 when STRIPE_CLIENT_ID is not set', async () => {
    delete process.env.STRIPE_CLIENT_ID
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('GET /api/onboarding/stripe/connect — redirect', () => {
  it('returns 307 redirect to https://connect.stripe.com/oauth/authorize', async () => {
    const res = await GET()
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('https://connect.stripe.com/oauth/authorize')
  })

  it('redirect URL contains client_id=ca_test_client', async () => {
    const res = await GET()
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('client_id=ca_test_client')
  })

  it('redirect URL contains response_type=code', async () => {
    const res = await GET()
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('response_type=code')
  })

  it('redirect URL contains redirect_uri pointing to /api/onboarding/stripe/callback', async () => {
    const res = await GET()
    const location = res.headers.get('location') ?? ''
    const parsed = new URL(location)
    const redirectUri = parsed.searchParams.get('redirect_uri') ?? ''
    expect(redirectUri).toContain('/api/onboarding/stripe/callback')
  })

  it('redirect URL contains a state param (base64url-encoded HMAC)', async () => {
    const res = await GET()
    const location = res.headers.get('location') ?? ''
    const parsed = new URL(location)
    const state = parsed.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(typeof state).toBe('string')
    expect((state as string).length).toBeGreaterThan(0)
  })
})

describe('GET /api/onboarding/stripe/connect — unauthenticated', () => {
  it('throws / redirects when verifyStoreSession rejects', async () => {
    vi.mocked(verifyStoreSession).mockRejectedValueOnce(new Error('Unauthorized'))
    // In Next.js, redirect() throws a NEXT_REDIRECT error; the handler may also throw.
    // We expect either a redirect response or an exception — just confirm it does NOT
    // return a successful 307 to Stripe.
    let res: Response | undefined
    try {
      res = await GET()
    } catch {
      // redirect() throw — expected
      return
    }
    // If it returns a response it should NOT be the Stripe OAuth URL
    if (res) {
      const location = res.headers.get('location') ?? ''
      expect(location).not.toContain('connect.stripe.com')
    }
  })
})
