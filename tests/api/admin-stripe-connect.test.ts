import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionMock = vi.hoisted(() => ({
  getSessionPayload: vi.fn(),
}))

const stripeMock = vi.hoisted(() => ({
  accountsCreate:    vi.fn(),
  accountsRetrieve:  vi.fn(),
  accountLinksCreate: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSessionPayload: sessionMock.getSessionPayload,
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      create: stripeMock.accountsCreate,
      retrieve: stripeMock.accountsRetrieve,
    },
    accountLinks: { create: stripeMock.accountLinksCreate },
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST, GET } from '@/app/api/admin/stripe/connect/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

function req(method: string, body: unknown = {}): Request {
  return new Request('http://localhost/api/admin/stripe/connect', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function mockStore(opts: { stripe_account_id: string | null }) {
  const updateBuilder = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: STORE_ID, stripe_account_id: opts.stripe_account_id },
          error: null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue(updateBuilder),
  })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  return { fromMock, updateBuilder }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/admin/stripe/connect', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await POST(req('POST') as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await POST(req('POST', 'not json{') as never)
    expect(res.status).toBe(400)
  })

  it('creates a new Stripe account when none exists', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockStore({ stripe_account_id: null })
    stripeMock.accountsCreate.mockResolvedValue({ id: 'acct_new' })
    stripeMock.accountLinksCreate.mockResolvedValue({ url: 'https://stripe.com/link' })

    const res = await POST(req('POST', {}) as never)
    expect(res.status).toBe(200)
    expect(stripeMock.accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'express', country: 'JP' })
    )
    expect(stripeMock.accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_new', type: 'account_onboarding' })
    )
  })

  it('reuses existing Stripe account', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockStore({ stripe_account_id: 'acct_existing' })
    stripeMock.accountLinksCreate.mockResolvedValue({ url: 'https://stripe.com/link' })

    const res = await POST(req('POST', {}) as never)
    expect(res.status).toBe(200)
    expect(stripeMock.accountsCreate).not.toHaveBeenCalled()
    expect(stripeMock.accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'acct_existing' })
    )
  })

  it('returns the onboarding URL', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockStore({ stripe_account_id: 'acct_x' })
    stripeMock.accountLinksCreate.mockResolvedValue({ url: 'https://stripe.com/onboard/abc' })

    const res = await POST(req('POST', {}) as never)
    const body = await res.json()
    expect(body.url).toBe('https://stripe.com/onboard/abc')
  })

  it('returns 500 when Stripe account creation fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockStore({ stripe_account_id: null })
    stripeMock.accountsCreate.mockRejectedValue(new Error('stripe down'))

    const res = await POST(req('POST', {}) as never)
    expect(res.status).toBe(500)
  })

  it('returns 500 when Stripe link creation fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockStore({ stripe_account_id: 'acct_x' })
    stripeMock.accountLinksCreate.mockRejectedValue(new Error('link fail'))

    const res = await POST(req('POST', {}) as never)
    expect(res.status).toBe(500)
  })
})

describe('GET /api/admin/stripe/connect', () => {
  it('returns 401 without session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns connected:false when no account', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { stripe_account_id: null }, error: null }),
        }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)

    const res = await GET()
    const body = await res.json()
    expect(body).toEqual({ connected: false })
  })

  it('returns full account status when connected', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { stripe_account_id: 'acct_x' }, error: null }),
        }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
    stripeMock.accountsRetrieve.mockResolvedValue({
      id: 'acct_x',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    })

    const res = await GET()
    const body = await res.json()
    expect(body).toMatchObject({
      connected: true,
      accountId: 'acct_x',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    })
  })
})
