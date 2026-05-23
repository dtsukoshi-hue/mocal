/**
 * 顧客キャンセル API のテスト
 * recovery-plan §5.2 Phase R-3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const supabaseUserMock = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
}))

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseUserMock),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

const refundPaymentMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/payment', () => ({
  refundPayment: refundPaymentMock,
}))

const sendPushMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/push', () => ({
  sendPushToOrder: sendPushMock,
}))

const checkRateLimitMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: checkRateLimitMock,
}))

import { POST } from '@/app/api/orders/[id]/cancel/route'
import { createServiceClient } from '@/lib/supabase-server'

const USER_ID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ID  = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ORDER_ID  = '22222222-2222-4222-8222-222222222222'
const CHARGE_ID = 'ch_test_123'

function makeRequest() {
  return new NextRequest(`http://localhost/api/orders/${ORDER_ID}/cancel`, { method: 'POST' })
}

function makeCtx(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function singleChain(data: unknown) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue({ data, error: null })
  return b
}

function updateChain(updatedRows: unknown[] | null = [{ id: ORDER_ID }], error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.update = vi.fn().mockReturnValue(b)
  b.eq     = vi.fn().mockReturnValue(b)
  b.select = vi.fn().mockResolvedValue({ data: updatedRows, error })
  return b
}

function mockClient(order: unknown, updatedRows: unknown[] | null = [{ id: ORDER_ID }]) {
  const orderChain = singleChain(order)
  const upChain = updateChain(updatedRows)
  let n = 0
  const client = {
    from: vi.fn().mockImplementation(() => {
      n++
      return n === 1 ? orderChain : upChain
    }),
  }
  vi.mocked(createServiceClient).mockReturnValue(client as never)
  return { client, orderChain, upChain }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue(true)
  supabaseUserMock.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  refundPaymentMock.mockResolvedValue({ refundId: 're_test' })
  sendPushMock.mockResolvedValue(undefined)
})

describe('POST /api/orders/[id]/cancel', () => {
  it('未認証 → 401', async () => {
    supabaseUserMock.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(401)
  })

  it('他人の order → 403', async () => {
    mockClient({ id: ORDER_ID, status: 'paid', user_id: OTHER_ID, stripe_charge_id: CHARGE_ID })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(403)
  })

  it('status=accepted の order → 422', async () => {
    mockClient({ id: ORDER_ID, status: 'accepted', user_id: USER_ID, stripe_charge_id: CHARGE_ID })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(422)
  })

  it('status=paid + charge あり → refunded で update + refund 呼ばれる', async () => {
    const { upChain } = mockClient({ id: ORDER_ID, status: 'paid', user_id: USER_ID, stripe_charge_id: CHARGE_ID })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'refunded' })
    expect(refundPaymentMock).toHaveBeenCalledWith(CHARGE_ID)
    expect(upChain.update).toHaveBeenCalledWith({ status: 'refunded', cancelled_reason_type: 'user_cancel' })
    expect(sendPushMock).toHaveBeenCalled()
  })

  it('status=paid + charge なし → cancelled で update (refund 呼ばれない)', async () => {
    const { upChain } = mockClient({ id: ORDER_ID, status: 'paid', user_id: USER_ID, stripe_charge_id: null })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'cancelled' })
    expect(refundPaymentMock).not.toHaveBeenCalled()
    expect(upChain.update).toHaveBeenCalledWith({ status: 'cancelled', cancelled_reason_type: 'user_cancel' })
  })

  it('refund 失敗 → cancelled で update (返金失敗時のフォールバック)', async () => {
    refundPaymentMock.mockRejectedValueOnce(new Error('stripe down'))
    const { upChain } = mockClient({ id: ORDER_ID, status: 'paid', user_id: USER_ID, stripe_charge_id: CHARGE_ID })
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'cancelled' })
    expect(upChain.update).toHaveBeenCalledWith({ status: 'cancelled', cancelled_reason_type: 'user_cancel' })
  })

  it('eq paid フィルタで 0 行 update (二重送信) → 409', async () => {
    mockClient({ id: ORDER_ID, status: 'paid', user_id: USER_ID, stripe_charge_id: null }, [])
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(409)
  })

  it('レート制限超過 → 429', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false)
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(429)
  })

  it('不正な UUID → 404', async () => {
    const res = await POST(makeRequest(), makeCtx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('order が存在しない → 404', async () => {
    mockClient(null)
    const res = await POST(makeRequest(), makeCtx())
    expect(res.status).toBe(404)
  })
})
