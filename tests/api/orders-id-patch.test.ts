import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock dependencies before importing the route handler
// ---------------------------------------------------------------------------

const supabaseUserMock = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
}))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseUserMock),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/webpush', () => ({
  notifyOrder: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/payment', () => ({
  refundPayment: vi.fn().mockResolvedValue({ refundId: 're_test' }),
}))

import { PATCH } from '@/app/api/orders/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STORE_ID  = '11111111-1111-4111-8111-111111111111'
const ORDER_ID  = '22222222-2222-4222-8222-222222222222'
const CHARGE_ID = 'ch_test_123'

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) } as never
}

/** Supabase chain builder for a single `.select().eq().single()` */
function singleChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error })
  return b
}

/** Supabase chain builder for `.update().eq().select().single()` */
function updateChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.select = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error })
  return b
}

function mockServiceClient(opts: {
  order?:      unknown
  orderError?: unknown
  member?:     unknown
  memberError?: unknown
  updateData?:  unknown
  updateError?: unknown
  store?:       unknown
  storeError?:  unknown
}) {
  const orderChain  = singleChain(opts.order  ?? null, opts.orderError  ?? null)
  const memberChain = singleChain(opts.member ?? null, opts.memberError ?? null)
  const upChain     = updateChain(opts.updateData ?? { id: ORDER_ID, status: 'accepted' }, opts.updateError ?? null)
  const storeChain  = singleChain(opts.store  ?? null, opts.storeError  ?? null)

  let fromCall = 0
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      fromCall++
      if (table === 'orders' && fromCall === 1) return orderChain
      if (table === 'store_members')             return memberChain
      if (table === 'orders' && fromCall >= 2)   return upChain
      if (table === 'stores')                    return storeChain
      return orderChain
    }),
  }
  vi.mocked(createServiceClient).mockReturnValue(client as never)
  return client
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: authenticated user
  supabaseUserMock.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  })
})

describe('PATCH /api/orders/[id] — auth', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseUserMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await PATCH(makeRequest({ status: 'accepted' }), makeCtx())
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/orders/[id] — input validation', () => {
  it('returns 400 for malformed JSON body', async () => {
    const req = new NextRequest(`http://localhost/api/orders/${ORDER_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    mockServiceClient({ order: { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null } })
    const res = await PATCH(req, makeCtx())
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid waitMinutes', async () => {
    mockServiceClient({
      order:  { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member: { role: 'staff' },
    })
    const res = await PATCH(makeRequest({ status: 'accepted', waitMinutes: 999 }), makeCtx())
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/orders/[id] — authorization', () => {
  it('returns 403 when user is not a store member', async () => {
    mockServiceClient({
      order:  { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member: null,
    })
    const res = await PATCH(makeRequest({ status: 'accepted' }), makeCtx())
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/orders/[id] — status transitions', () => {
  it('returns 422 for an invalid transition (paid → completed)', async () => {
    mockServiceClient({
      order:  { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member: { role: 'staff' },
    })
    const res = await PATCH(makeRequest({ status: 'completed' }), makeCtx())
    expect(res.status).toBe(422)
  })

  it('returns 422 for a same-status transition (paid → paid)', async () => {
    mockServiceClient({
      order:  { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member: { role: 'staff' },
    })
    const res = await PATCH(makeRequest({ status: 'paid' }), makeCtx())
    expect(res.status).toBe(422)
  })

  it('returns 200 for paid → accepted with default waitMinutes', async () => {
    mockServiceClient({
      order:      { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
      updateData: { id: ORDER_ID, status: 'accepted' },
    })
    const res = await PATCH(makeRequest({ status: 'accepted' }), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order).toBeDefined()
  })

  it('returns 200 for paid → accepted with explicit waitMinutes=30', async () => {
    mockServiceClient({
      order:      { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
      updateData: { id: ORDER_ID, status: 'accepted' },
    })
    const res = await PATCH(makeRequest({ status: 'accepted', waitMinutes: 30 }), makeCtx())
    expect(res.status).toBe(200)
  })

  it('returns 200 for accepted → cancelled (no charge → no refund)', async () => {
    mockServiceClient({
      order:      { id: ORDER_ID, status: 'accepted', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
      updateData: { id: ORDER_ID, status: 'cancelled' },
    })
    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeCtx())
    expect(res.status).toBe(200)
  })

  it('cancelledReasonType: out_of_stock を受理 (R-5 L10)', async () => {
    const client = mockServiceClient({
      order:      { id: ORDER_ID, status: 'accepted', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
      updateData: { id: ORDER_ID, status: 'cancelled' },
    })
    const res = await PATCH(
      makeRequest({ status: 'cancelled', cancelledReasonType: 'out_of_stock' }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    // 3 番目の from('orders') が update chain
    const upCall = client.from.mock.results[2].value
    expect(upCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'out_of_stock' })
    )
  })

  it('cancelledReasonType 未指定の場合は store_cancel にフォールバック', async () => {
    const client = mockServiceClient({
      order:      { id: ORDER_ID, status: 'accepted', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
      updateData: { id: ORDER_ID, status: 'cancelled' },
    })
    await PATCH(makeRequest({ status: 'cancelled' }), makeCtx())
    const upCall = client.from.mock.results[2].value
    expect(upCall.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'store_cancel' })
    )
  })

  it('cancelledReasonType: 不正値で 400', async () => {
    mockServiceClient({
      order:      { id: ORDER_ID, status: 'accepted', store_id: STORE_ID, stripe_charge_id: null },
      member:     { role: 'staff' },
    })
    const res = await PATCH(
      makeRequest({ status: 'cancelled', cancelledReasonType: 'invalid' }),
      makeCtx()
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/orders/[id] — refund flow', () => {
  it('triggers refund when cancelling a charged order', async () => {
    // Need a more controlled mock for refund flow
    const orderChain   = singleChain({ id: ORDER_ID, status: 'accepted', store_id: STORE_ID, stripe_charge_id: CHARGE_ID })
    const memberChain  = singleChain({ role: 'owner' })
    const updateChain1 = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }
    updateChain1.update.mockReturnValue(updateChain1)
    updateChain1.eq.mockReturnValue(updateChain1)
    updateChain1.select.mockReturnValue(updateChain1)
    updateChain1.single.mockResolvedValue({ data: { id: ORDER_ID, status: 'cancelled' }, error: null })

    const storeChain   = singleChain({ stripe_account_id: 'acct_test' })
    const updateChain2 = { update: vi.fn(), eq: vi.fn() }
    updateChain2.update.mockReturnValue(updateChain2)
    updateChain2.eq.mockResolvedValue({ error: null })

    let fromCall = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        fromCall++
        if (table === 'orders'        && fromCall === 1) return orderChain
        if (table === 'store_members')                   return memberChain
        if (table === 'orders'        && fromCall === 3) return updateChain1
        if (table === 'stores')                          return storeChain
        if (table === 'orders'        && fromCall >= 4)  return updateChain2
        return orderChain
      }),
    } as never)

    const { refundPayment } = await import('@/lib/payment')
    const res = await PATCH(makeRequest({ status: 'cancelled' }), makeCtx())
    expect(res.status).toBe(200)
    expect(refundPayment).toHaveBeenCalledWith(CHARGE_ID)
  })
})

describe('PATCH /api/orders/[id] — DB errors', () => {
  it('returns 500 when order fetch fails', async () => {
    mockServiceClient({ orderError: { message: 'DB error' } })
    const res = await PATCH(makeRequest({ status: 'accepted' }), makeCtx())
    expect(res.status).toBe(500)
  })

  it('returns 500 when update fails', async () => {
    const orderChain  = singleChain({ id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null })
    const memberChain = singleChain({ role: 'staff' })
    const upChain     = updateChain(null, { message: 'fail' })

    let call = 0
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        call++
        if (call === 1) return orderChain
        if (call === 2) return memberChain
        return upChain
      }),
    } as never)

    const res = await PATCH(makeRequest({ status: 'accepted' }), makeCtx())
    expect(res.status).toBe(500)
  })
})
