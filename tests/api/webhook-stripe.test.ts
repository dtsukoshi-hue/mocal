import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stripe / Supabase / push を mock
const stripeMock = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  refundsCreate: vi.fn(),
}))

const pushMock = vi.hoisted(() => ({
  sendPushToStore: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: stripeMock.constructEvent },
    refunds: { create: stripeMock.refundsCreate },
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/push', () => ({
  sendPushToStore: pushMock.sendPushToStore,
}))

import { POST } from '@/app/api/webhook/stripe/route'
import { createServiceClient } from '@/lib/supabase-server'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const STORE_ID = '22222222-2222-4222-8222-222222222222'

function makeRequest(body = '{}', sig: string | null = 'test-sig') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sig) headers['stripe-signature'] = sig
  return new Request('http://localhost/api/webhook/stripe', {
    method: 'POST',
    headers,
    body,
  })
}

// Supabase の各テーブル/操作を mock するヘルパー
function setupSupabaseMock(opts: {
  webhookInsertError?: { code: string } | null
  orderRow?: { store_id: string; total_amount: number; status: string; order_number: number } | null
  storeRow?: { is_open: boolean; name: string } | null
}) {
  const calls = {
    orderUpdate: vi.fn().mockResolvedValue({ error: null }),
  }

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'processed_webhook_events') {
      return {
        insert: vi.fn().mockResolvedValue({ error: opts.webhookInsertError ?? null }),
      }
    }
    if (table === 'orders') {
      // 1回目: select(...).eq().eq().single() で order を取得
      // 2回目以降: update(...).eq()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: opts.orderRow ?? null, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data: unknown) => {
          calls.orderUpdate(data)
          // .eq() を任意回数チェイン可能にして最後に Promise を返す
          const eqChain: { eq: ReturnType<typeof vi.fn>; then: (fn: (v: { error: null }) => unknown) => unknown } = {
            eq: vi.fn(() => eqChain),
            then: (fn) => fn({ error: null }),
          }
          return eqChain
        }),
      }
    }
    if (table === 'stores') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: opts.storeRow ?? null, error: null }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhook/stripe', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await POST(makeRequest('{}', null) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when signature verification fails', async () => {
    stripeMock.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const res = await POST(makeRequest() as never)
    expect(res.status).toBe(400)
  })

  it('returns 200 (received) on duplicate event (idempotency)', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_dup',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_x', metadata: { order_id: ORDER_ID } } },
    })
    setupSupabaseMock({ webhookInsertError: { code: '23505' } }) // unique violation
    const res = await POST(makeRequest() as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.received).toBe(true)
  })

  it('updates order to paid on payment_intent.succeeded', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_ok',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_ok',
          amount: 800,
          metadata: { order_id: ORDER_ID },
          latest_charge: 'ch_ok',
        },
      },
    })
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'pending', order_number: 1001 },
      storeRow: { is_open: true, name: 'Cafe' },
    })

    const res = await POST(makeRequest() as never)
    expect(res.status).toBe(200)
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'paid', stripe_charge_id: 'ch_ok' })
    )
  })

  it('cancels order if store is closed', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_closed',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi', amount: 800, metadata: { order_id: ORDER_ID } } },
    })
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'pending', order_number: 1001 },
      storeRow: { is_open: false, name: 'Cafe' },
    })

    await POST(makeRequest() as never)
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'store_closed' })
    )
  })

  it('cancels order on amount mismatch', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_mismatch',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi', amount: 900, metadata: { order_id: ORDER_ID } } },
    })
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'pending', order_number: 1001 },
      storeRow: { is_open: true, name: 'Cafe' },
    })

    await POST(makeRequest() as never)
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'amount_mismatch' })
    )
  })

  it('skips processing when order already not pending', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_late',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi', amount: 800, metadata: { order_id: ORDER_ID } } },
    })
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'paid', order_number: 1001 },
      storeRow: { is_open: true, name: 'Cafe' },
    })

    const res = await POST(makeRequest() as never)
    expect(res.status).toBe(200)
    expect(calls.orderUpdate).not.toHaveBeenCalled()
  })

  it('cancels on payment_intent.payment_failed', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi', metadata: { order_id: ORDER_ID } } },
    })
    const calls = setupSupabaseMock({})

    await POST(makeRequest() as never)
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'payment_failed' })
    )
  })

  it('auto-refunds and sets refunded when store is closed and charge exists', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_closed_refund',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi',
          amount: 800,
          metadata: { order_id: ORDER_ID },
          latest_charge: 'ch_closed',
        },
      },
    })
    stripeMock.refundsCreate.mockResolvedValue({ id: 'ref_ok' })
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'pending', order_number: 1001 },
      storeRow: { is_open: false, name: 'Cafe' },
    })

    await POST(makeRequest() as never)
    expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ charge: 'ch_closed', refund_application_fee: true, reverse_transfer: true })
    )
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded', cancelled_reason_type: 'store_closed', stripe_charge_id: 'ch_closed' })
    )
  })

  it('sets cancelled (not refunded) when store closed but refund fails', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_closed_refund_fail',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi',
          amount: 800,
          metadata: { order_id: ORDER_ID },
          latest_charge: 'ch_fail',
        },
      },
    })
    stripeMock.refundsCreate.mockRejectedValue(new Error('stripe error'))
    const calls = setupSupabaseMock({
      orderRow: { store_id: STORE_ID, total_amount: 800, status: 'pending', order_number: 1001 },
      storeRow: { is_open: false, name: 'Cafe' },
    })

    await POST(makeRequest() as never)
    expect(calls.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'store_closed' })
    )
  })

  it('ignores unknown event types', async () => {
    stripeMock.constructEvent.mockReturnValue({
      id: 'evt_unknown',
      type: 'customer.created',
      data: { object: {} },
    })
    setupSupabaseMock({})
    const res = await POST(makeRequest() as never)
    expect(res.status).toBe(200)
  })
})
