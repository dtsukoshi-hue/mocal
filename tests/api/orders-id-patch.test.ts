import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase + Stripe + session を mock してから route handler を import する
// （vi.mock はファイル先頭で巻き上げられるため、handler import より前に書く必要はないが
//  読みやすさで先に書く）

const sessionMock = vi.hoisted(() => ({
  getSessionPayload: vi.fn(),
}))

const stripeMock = vi.hoisted(() => ({
  refundsCreate: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSessionPayload: sessionMock.getSessionPayload,
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    refunds: { create: stripeMock.refundsCreate },
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { PATCH } from '@/app/api/orders/[id]/route'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/' + ORDER_ID, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) } as never
}

// supabase chain mock を組み立てる
function mockSupabase(opts: {
  orderRow?: { id: string; status: string; store_id: string; stripe_charge_id: string | null } | null
  updateOk?: boolean
}) {
  const selectBuilder: Record<string, unknown> = {}
  selectBuilder.select = vi.fn().mockReturnValue(selectBuilder)
  selectBuilder.eq = vi.fn().mockReturnValue(selectBuilder)
  selectBuilder.single = vi.fn().mockResolvedValue({
    data: opts.orderRow ?? null,
    error: null,
  })

  const updateBuilder: Record<string, unknown> = {}
  updateBuilder.update = vi.fn().mockReturnValue(updateBuilder)
  updateBuilder.eq = vi.fn().mockReturnValue(updateBuilder)
  updateBuilder.select = vi.fn().mockReturnValue(updateBuilder)
  updateBuilder.single = vi.fn().mockResolvedValue(
    opts.updateOk === false
      ? { data: null, error: { message: 'fail' } }
      : { data: { id: ORDER_ID, status: 'updated' }, error: null }
  )

  // route 内で from('orders') が 2 回呼ばれる（select 用、update 用）
  let call = 0
  const fromMock = vi.fn().mockImplementation(() => {
    call++
    return call === 1 ? selectBuilder : updateBuilder
  })

  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  return { fromMock, selectBuilder, updateBuilder }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/orders/[id]', () => {
  it('returns 401 when no session', async () => {
    sessionMock.getSessionPayload.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ status: 'accepted' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(401)
  })

  it('returns 404 for invalid UUID', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await PATCH(makeRequest({ status: 'accepted' }) as never, makeCtx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid JSON body', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{',
    })
    const res = await PATCH(req as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const res = await PATCH(makeRequest({ status: 'evil' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when order not found', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockSupabase({ orderRow: null })
    const res = await PATCH(makeRequest({ status: 'accepted' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(404)
  })

  it('returns 403 when order belongs to another store', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockSupabase({
      orderRow: { id: ORDER_ID, status: 'paid', store_id: 'other-store', stripe_charge_id: null },
    })
    const res = await PATCH(makeRequest({ status: 'accepted' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(403)
  })

  it('returns 422 for invalid status transition', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockSupabase({
      orderRow: { id: ORDER_ID, status: 'completed', store_id: STORE_ID, stripe_charge_id: null },
    })
    // completed -> accepted is not allowed
    const res = await PATCH(makeRequest({ status: 'accepted' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(422)
  })

  it('updates status on valid transition (paid -> accepted)', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    const { updateBuilder } = mockSupabase({
      orderRow: { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
    })
    const res = await PATCH(
      makeRequest({ status: 'accepted', waitMinutes: 15 }) as never,
      makeCtx(ORDER_ID)
    )
    expect(res.status).toBe(200)
    // update が呼ばれた検証
    expect(updateBuilder.update).toHaveBeenCalled()
    const updateCall = (updateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateCall.status).toBe('accepted')
    expect(updateCall.accepted_at).toBeDefined()
    expect(updateCall.estimated_ready_at).toBeDefined()
  })

  it('triggers Stripe refund and sets refunded on cancel with charge', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    stripeMock.refundsCreate.mockResolvedValue({ id: 're_test' })
    const { updateBuilder } = mockSupabase({
      orderRow: { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: 'ch_test' },
    })

    const res = await PATCH(makeRequest({ status: 'cancelled' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(200)
    expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ charge: 'ch_test', refund_application_fee: true, reverse_transfer: true })
    )
    const updateCall = (updateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateCall.status).toBe('refunded')
  })

  it('falls back to cancelled when refund fails', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    stripeMock.refundsCreate.mockRejectedValue(new Error('stripe boom'))
    const { updateBuilder } = mockSupabase({
      orderRow: { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: 'ch_test' },
    })

    const res = await PATCH(makeRequest({ status: 'cancelled' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(200)
    const updateCall = (updateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(updateCall.status).toBe('cancelled')
  })

  it('does not call Stripe refund when no charge id', async () => {
    sessionMock.getSessionPayload.mockResolvedValue({ storeId: STORE_ID })
    mockSupabase({
      orderRow: { id: ORDER_ID, status: 'paid', store_id: STORE_ID, stripe_charge_id: null },
    })
    const res = await PATCH(makeRequest({ status: 'cancelled' }) as never, makeCtx(ORDER_ID))
    expect(res.status).toBe(200)
    expect(stripeMock.refundsCreate).not.toHaveBeenCalled()
  })
})
