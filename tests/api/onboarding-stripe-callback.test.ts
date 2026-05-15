import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const supabaseMock = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseMock),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

import { GET } from '@/app/api/onboarding/stripe/callback/route'
import { createServiceClient } from '@/lib/supabase-server'
import { getStripe } from '@/lib/stripe'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STORE_ID = '11111111-1111-4111-8111-111111111111'
const APP_URL  = 'http://localhost:3000'

/** Generate a valid HMAC-signed state matching the route's verifyState() */
function makeValidState(storeId: string, nonce = 'test-nonce-abc'): string {
  const secret  = 'whsec_test_dummy'   // from tests/setup.ts
  const payload = { storeId, nonce }
  const sig     = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url')
}

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL(`${APP_URL}/api/onboarding/stripe/callback`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function singleChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error })
  return b
}

function updateChain(error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockResolvedValue({ error })
  return b
}

function mockServiceClient(
  memberData: unknown = { role: 'owner' },
  updateError: unknown = null,
) {
  const memberChain = singleChain(memberData)
  const upChain     = updateChain(updateError)

  let fromCall = 0
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      fromCall++
      if (table === 'store_members') return memberChain
      if (table === 'stores')        return upChain
      return memberChain
    }),
  } as never)
}

const stripeMock = {
  oauth: { token: vi.fn().mockResolvedValue({ stripe_user_id: 'acct_test123' }) },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  })
  vi.mocked(getStripe).mockReturnValue(stripeMock as never)
  mockServiceClient()
})

describe('GET /api/onboarding/stripe/callback — early exits', () => {
  it('redirects to /admin/settings?stripe_error=... when error param is present', async () => {
    const res = await GET(makeReq({ error: 'access_denied' }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/settings')
    expect(loc).toContain('stripe_error=')
    expect(loc).toContain('access_denied')
  })

  it('redirects to .../stripe_error=invalid_callback when code is missing', async () => {
    const res = await GET(makeReq({ state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=invalid_callback')
  })

  it('redirects to .../stripe_error=invalid_callback when state is missing', async () => {
    const res = await GET(makeReq({ code: 'ac_test_code' }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=invalid_callback')
  })

  it('redirects to .../stripe_error=invalid_state when state HMAC is tampered', async () => {
    const tamperedState = makeValidState(STORE_ID).slice(0, -4) + 'XXXX'
    const res = await GET(makeReq({ code: 'ac_test', state: tamperedState }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=invalid_state')
  })
})

describe('GET /api/onboarding/stripe/callback — auth & authorization', () => {
  it('redirects to /admin/login when user is not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/login')
  })

  it('redirects to .../stripe_error=unauthorized when user is not an owner', async () => {
    mockServiceClient({ role: 'staff' })
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=unauthorized')
  })

  it('redirects to .../stripe_error=unauthorized when user has no membership', async () => {
    mockServiceClient(null)
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=unauthorized')
  })
})

describe('GET /api/onboarding/stripe/callback — success', () => {
  it('returns 307 redirect to .../stripe_connected=1 on full success', async () => {
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_connected=1')
  })

  it('Stripe oauth.token is called with the correct code', async () => {
    await GET(makeReq({ code: 'ac_real_code', state: makeValidState(STORE_ID) }))
    expect(stripeMock.oauth.token).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ac_real_code', grant_type: 'authorization_code' }),
    )
  })

  it('stores table is updated with the returned stripe_user_id', async () => {
    const memberChain = singleChain({ role: 'owner' })
    const upChain     = updateChain(null)

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'store_members') return memberChain
        if (table === 'stores')        return upChain
        return memberChain
      }),
    } as never)

    await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(vi.mocked(upChain.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_account_id: 'acct_test123' }),
    )
  })
})

describe('GET /api/onboarding/stripe/callback — errors', () => {
  it('redirects to .../stripe_error=token_exchange_failed when Stripe token exchange throws', async () => {
    stripeMock.oauth.token.mockRejectedValueOnce(new Error('stripe error'))
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=token_exchange_failed')
  })

  it('redirects to .../stripe_error=db_error when DB update fails', async () => {
    mockServiceClient({ role: 'owner' }, { message: 'db fail' })
    const res = await GET(makeReq({ code: 'ac_test', state: makeValidState(STORE_ID) }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('stripe_error=db_error')
  })
})
