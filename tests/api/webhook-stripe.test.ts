import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const stripeMock = vi.hoisted(() => ({
  webhooks: {
    constructEvent: vi.fn(),
  },
  charges: {
    retrieve: vi.fn(),
  },
}))

const refundPaymentMock = vi.hoisted(() => ({ fn: vi.fn() }))
const notifyStoreMock   = vi.hoisted(() => ({ fn: vi.fn() }))
const notifyOrderMock   = vi.hoisted(() => ({ fn: vi.fn() }))
const sendEmailMock     = vi.hoisted(() => ({ fn: vi.fn() }))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue(stripeMock),
}))

vi.mock('@/lib/payment', () => ({
  refundPayment: refundPaymentMock.fn,
}))

vi.mock('@/lib/webpush', () => ({
  notifyStore: notifyStoreMock.fn,
  notifyOrder: notifyOrderMock.fn,
}))

vi.mock('@/lib/email', () => ({
  sendOrderConfirmEmail: sendEmailMock.fn,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { POST } from '@/app/api/webhook/stripe/route'
import { createServiceClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORDER_ID  = '22222222-2222-4222-8222-222222222222'
const STORE_ID  = '11111111-1111-4111-8111-111111111111'
const CHARGE_ID = 'ch_test_abc'
const EVENT_ID  = 'evt_test_001'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string = '{}', sig = 'stripe-sig-test') {
  return new NextRequest('http://localhost/api/webhook/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': sig,
      'Content-Type': 'application/json',
    },
    body,
  })
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_test_001',
    amount: 1000,
    latest_charge: CHARGE_ID,
    receipt_email: null,
    metadata: { order_id: ORDER_ID },
    ...overrides,
  }
}

function makeEvent(type: string, object: unknown, id = EVENT_ID) {
  return { id, type, data: { object } }
}

/** Build a supabase chain that resolves any .from().x().y() call */
function singleChain(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.select  = vi.fn().mockReturnValue(b)
  b.insert  = vi.fn().mockReturnValue(b)
  b.update  = vi.fn().mockReturnValue(b)
  b.delete  = vi.fn().mockReturnValue(b)
  b.upsert  = vi.fn().mockReturnValue(b)
  b.eq      = vi.fn().mockReturnValue(b)
  b.neq     = vi.fn().mockReturnValue(b)
  b.single  = vi.fn().mockResolvedValue({ data, error })
  b.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return b
}

function insertChain(error: unknown = null) {
  const b: Record<string, unknown> = {}
  b.insert = vi.fn().mockResolvedValue({ error })
  return b
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  notifyStoreMock.fn.mockResolvedValue(undefined)
  notifyOrderMock.fn.mockResolvedValue(undefined)
  refundPaymentMock.fn.mockResolvedValue({ id: 're_test' })
  sendEmailMock.fn.mockResolvedValue(undefined)
  stripeMock.charges.retrieve.mockResolvedValue({ receipt_url: 'https://receipt.stripe.com/r/test' })
})

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('POST /api/webhook/stripe — signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new NextRequest('http://localhost/api/webhook/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when constructEvent throws (invalid signature)', async () => {
    stripeMock.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('Signature verification failed')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/署名/)
  })
})

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('POST /api/webhook/stripe — idempotency', () => {
  it('returns 200 immediately for duplicate event (23505 unique constraint)', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )
    const client = {
      from: vi.fn().mockReturnValue(insertChain({ code: '23505', message: 'duplicate' })),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
    // No further DB queries after idempotency short-circuit
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('returns 500 when processed_webhook_events insert fails with unexpected error', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )
    const client = {
      from: vi.fn().mockReturnValue(insertChain({ code: '42P01', message: 'table missing' })),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// payment_intent.succeeded — happy path
// ---------------------------------------------------------------------------

describe('POST /api/webhook/stripe — payment_intent.succeeded', () => {
  function setupSucceededTest(opts: {
    order?: Record<string, unknown>
    store?: Record<string, unknown>
    upsertError?: unknown
    updateError?: unknown
  }) {
    const order = opts.order ?? {
      store_id: STORE_ID,
      user_id: null,
      total_amount: 1000,
      status: 'pending',
    }
    const store = opts.store ?? { stripe_account_id: 'acct_test', is_open: true }

    const eventTableChain = insertChain(null) // processed_webhook_events
    const orderFetchChain = singleChain(order)
    const storeFetchChain = singleChain(store)
    const orderUpdateChain = singleChain({ id: ORDER_ID, status: 'paid' }, opts.updateError ?? null)
    // extra select for email
    const orderDetailChain = singleChain(null)

    let call = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        call++
        if (table === 'processed_webhook_events') return eventTableChain
        if (table === 'orders' && call <= 2)     return orderFetchChain
        if (table === 'stores')                  return storeFetchChain
        if (table === 'orders')                  return orderUpdateChain
        return orderDetailChain
      }),
      auth: {
        admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null } }) },
      },
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)
    return client
  }

  it('sets order to paid and notifies store on successful payment', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )
    setupSucceededTest({})

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(notifyStoreMock.fn).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({ title: expect.stringContaining('新規注文') })
    )
  })

  it('skips update and returns 200 when order has no order_id metadata', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent({ metadata: {} }))
    )

    const eventTableChain = insertChain(null)
    const client = {
      from: vi.fn().mockImplementation(() => eventTableChain),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('auto-refunds and sets refunded when already-cancelled order receives payment', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )
    const order = { store_id: STORE_ID, user_id: null, total_amount: 1000, status: 'cancelled' }

    const eventTableChain    = insertChain(null)
    const orderFetchChain    = singleChain(order)
    const storeFetchChain    = singleChain({ stripe_account_id: 'acct_test' })
    const orderUpdateChain   = { update: vi.fn(), eq: vi.fn() }
    orderUpdateChain.update.mockReturnValue(orderUpdateChain)
    orderUpdateChain.eq.mockResolvedValue({ error: null })

    let call = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        call++
        if (table === 'processed_webhook_events') return eventTableChain
        if (table === 'orders' && call <= 2)     return orderFetchChain
        if (table === 'stores')                  return storeFetchChain
        return orderUpdateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(refundPaymentMock.fn).toHaveBeenCalledWith(CHARGE_ID)
  })

  it('cancels and refunds when store is closed', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )
    const store = { stripe_account_id: 'acct_test', is_open: false }

    setupSucceededTest({ store })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(refundPaymentMock.fn).toHaveBeenCalledWith(CHARGE_ID)
  })

  it('cancels and refunds when amount does not match', async () => {
    // Order expects 2000 but intent has 1000
    const order = { store_id: STORE_ID, user_id: null, total_amount: 2000, status: 'pending' }
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent({ amount: 1000 }))
    )

    setupSucceededTest({ order })

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(refundPaymentMock.fn).toHaveBeenCalled()
  })

  it('returns 500 and deletes idempotency record when paid update fails (F-05)', async () => {
    // F-05 修正の核心: paid 更新が失敗したら 200 ではなく 500 を返し、
    // 冪等性レコードを削除して Stripe にリトライさせる。
    // 旧実装ではこのケースで 200 を返し、注文が pending 永久放置されていた。
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.succeeded', makeIntent())
    )

    const eventInsertChain = insertChain(null)
    const eventDeleteChain: Record<string, unknown> = {}
    eventDeleteChain.delete = vi.fn().mockReturnValue(eventDeleteChain)
    eventDeleteChain.eq     = vi.fn().mockResolvedValue({ error: null })

    const order = { store_id: STORE_ID, user_id: null, total_amount: 1000, status: 'pending' }
    const store = { stripe_account_id: 'acct_test', is_open: true }

    const orderFetchChain = singleChain(order)
    const storeFetchChain = singleChain(store)
    // paid 更新で error を返す
    const orderUpdateChain: Record<string, unknown> = {}
    orderUpdateChain.update = vi.fn().mockReturnValue(orderUpdateChain)
    orderUpdateChain.eq     = vi.fn().mockResolvedValue({ error: { message: 'connection lost' } })

    let eventCall = 0
    let orderTableCall = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'processed_webhook_events') {
          eventCall++
          return eventCall === 1 ? eventInsertChain : eventDeleteChain
        }
        if (table === 'stores') return storeFetchChain
        // orders: 1 回目は fetch (single), 2 回目は update
        orderTableCall++
        return orderTableCall === 1 ? orderFetchChain : orderUpdateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(eventDeleteChain.delete).toHaveBeenCalled()
    expect(eventDeleteChain.eq).toHaveBeenCalledWith('stripe_event_id', EVENT_ID)
  })
})

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------

describe('POST /api/webhook/stripe — payment_intent.payment_failed', () => {
  it('cancels pending order on payment failure', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.payment_failed', makeIntent())
    )

    const eventChain  = insertChain(null)
    // route chains: .update().eq('id').eq('status') — need two eq calls
    const updateChain: Record<string, unknown> = {}
    updateChain.update = vi.fn().mockReturnValue(updateChain)
    updateChain.eq     = vi.fn().mockReturnValue(updateChain)
    // 最後の eq() 呼び出しだけ resolve するように
    let eqCount = 0
    ;(updateChain.eq as ReturnType<typeof vi.fn>).mockImplementation(() => {
      eqCount++
      if (eqCount >= 2) return Promise.resolve({ error: null })
      return updateChain
    })

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'processed_webhook_events') return eventChain
        return updateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancelled_reason_type: 'payment_failed' })
    )
  })

  it('returns 500 when update fails so Stripe retries (F-05)', async () => {
    // F-05 修正後: DB エラー時は冪等性レコードを削除して 500 を返す。
    // Stripe が retry → 次回 webhook で正常処理される、
    // または order 状態が永久放置されることを防ぐ。
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('payment_intent.payment_failed', makeIntent())
    )

    // processed_webhook_events: 1回目は INSERT 成功、2回目は DELETE
    const eventInsertChain = insertChain(null)
    const eventDeleteChain: Record<string, unknown> = {}
    eventDeleteChain.delete = vi.fn().mockReturnValue(eventDeleteChain)
    eventDeleteChain.eq     = vi.fn().mockResolvedValue({ error: null })

    let eqCount2 = 0
    const updateChain: Record<string, unknown> = {}
    updateChain.update = vi.fn().mockReturnValue(updateChain)
    updateChain.eq     = vi.fn().mockImplementation(() => {
      eqCount2++
      if (eqCount2 >= 2) return Promise.resolve({ error: { message: 'DB error' } })
      return updateChain
    })

    let eventCallCount = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'processed_webhook_events') {
          eventCallCount++
          return eventCallCount === 1 ? eventInsertChain : eventDeleteChain
        }
        return updateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    // 冪等性レコードが削除されたことを verify (Stripe retry 時に重複扱いされないため)
    expect(eventDeleteChain.delete).toHaveBeenCalled()
    expect(eventDeleteChain.eq).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// charge.refunded
// ---------------------------------------------------------------------------

describe('POST /api/webhook/stripe — charge.refunded', () => {
  it('sets order to refunded and notifies when charge found in DB', async () => {
    const chargeObj = { id: CHARGE_ID }
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('charge.refunded', chargeObj)
    )

    const eventChain  = insertChain(null)
    const orderChain  = singleChain({ id: ORDER_ID })
    const updateChain = { update: vi.fn(), eq: vi.fn(), neq: vi.fn(), select: vi.fn() }
    updateChain.update.mockReturnValue(updateChain)
    updateChain.eq.mockReturnValue(updateChain)
    updateChain.neq.mockReturnValue(updateChain)
    // 1 行 update → notify 呼ばれる (#57)
    updateChain.select.mockResolvedValue({ data: [{ id: ORDER_ID }], error: null })

    let call = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        call++
        if (table === 'processed_webhook_events') return eventChain
        if (table === 'orders' && call === 2)    return orderChain
        return updateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(notifyOrderMock.fn).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ title: '返金処理が完了しました' })
    )
  })

  // -------------------------------------------------------------------------
  // #54 図 B 経路 3 冪等性 / #57 二重通知防止:
  // 既 refunded 状態の order に webhook 再発火しても、(a) update は
  // .neq('status', 'refunded') で 0 行に抑止され、(b) updated rows = 0 なら
  // notify を skip して顧客への重複通知を防ぐ (#57 修正済)。
  // -------------------------------------------------------------------------
  it('既 refunded order への charge.refunded 再発火: update 0 行 → notify skip', async () => {
    const chargeObj = { id: CHARGE_ID }
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('charge.refunded', chargeObj)
    )

    const eventChain = insertChain(null)
    const orderChain = singleChain({ id: ORDER_ID })
    const updateChain = { update: vi.fn(), eq: vi.fn(), neq: vi.fn(), select: vi.fn() }
    updateChain.update.mockReturnValue(updateChain)
    updateChain.eq.mockReturnValue(updateChain)
    updateChain.neq.mockReturnValue(updateChain)
    // 既 refunded のため neq filter で 0 行 update (.select('id') で affected rows = [])
    updateChain.select.mockResolvedValue({ data: [], error: null })

    let call = 0
    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        call++
        if (table === 'processed_webhook_events') return eventChain
        if (table === 'orders' && call === 2)    return orderChain
        return updateChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    // 冪等性の証拠: update chain に neq('status', 'refunded') + select('id') が付与
    expect(updateChain.neq).toHaveBeenCalledWith('status', 'refunded')
    expect(updateChain.select).toHaveBeenCalledWith('id')
    // #57 修正: 0 行 update なら notifyOrder は呼ばれない (二重通知防止)
    expect(notifyOrderMock.fn).not.toHaveBeenCalled()
  })

  it('skips update when charge is not in DB (external charge)', async () => {
    const chargeObj = { id: 'ch_unknown' }
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(
      makeEvent('charge.refunded', chargeObj)
    )

    const eventChain = insertChain(null)
    const orderChain = { ...singleChain(null), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'processed_webhook_events') return eventChain
        return orderChain
      }),
    }
    vi.mocked(createServiceClient).mockReturnValue(client as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(notifyOrderMock.fn).not.toHaveBeenCalled()
  })
})
