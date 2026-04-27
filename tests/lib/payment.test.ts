import { describe, it, expect, vi, beforeEach } from 'vitest'

const stripeMock = vi.hoisted(() => ({
  paymentIntentsCreate: vi.fn(),
  refundsCreate: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: { create: stripeMock.paymentIntentsCreate },
    refunds: { create: stripeMock.refundsCreate },
  },
}))

import { createPayment, refundPayment } from '@/lib/payment'

beforeEach(() => {
  vi.clearAllMocks()
  stripeMock.paymentIntentsCreate.mockResolvedValue({
    client_secret: 'cs_test',
    id: 'pi_test',
  })
})

describe('createPayment', () => {
  it('passes JPY amount and order_id metadata', async () => {
    await createPayment(1000, 'order-uuid')
    const params = stripeMock.paymentIntentsCreate.mock.calls[0][0]
    expect(params.amount).toBe(1000)
    expect(params.currency).toBe('jpy')
    expect(params.metadata.order_id).toBe('order-uuid')
    expect(params.automatic_payment_methods.enabled).toBe(true)
  })

  it('does not set Connect transfer_data when no connected account', async () => {
    await createPayment(1000, 'order-uuid')
    const params = stripeMock.paymentIntentsCreate.mock.calls[0][0]
    expect(params.application_fee_amount).toBeUndefined()
    expect(params.transfer_data).toBeUndefined()
  })

  it('sets application_fee at 6.4% (floored) for connected account', async () => {
    await createPayment(1000, 'order-uuid', 'acct_xxx')
    const params = stripeMock.paymentIntentsCreate.mock.calls[0][0]
    expect(params.application_fee_amount).toBe(64)
    expect(params.transfer_data).toEqual({ destination: 'acct_xxx' })
  })

  it('floors fractional fees correctly (e.g. 199 yen → 12 yen fee)', async () => {
    await createPayment(199, 'order-uuid', 'acct_xxx')
    const params = stripeMock.paymentIntentsCreate.mock.calls[0][0]
    // 199 * 0.064 = 12.736 → floor → 12
    expect(params.application_fee_amount).toBe(12)
  })

  it('returns clientSecret and paymentIntentId', async () => {
    const r = await createPayment(1000, 'order-uuid')
    expect(r).toEqual({ clientSecret: 'cs_test', paymentIntentId: 'pi_test' })
  })
})

describe('refundPayment', () => {
  it('refunds via charge id', async () => {
    stripeMock.refundsCreate.mockResolvedValue({ id: 're_test' })
    const r = await refundPayment('ch_test')
    expect(stripeMock.refundsCreate).toHaveBeenCalledWith({ charge: 'ch_test' }, undefined)
    expect(r.refundId).toBe('re_test')
  })

  it('passes Stripe-Account header for connected account', async () => {
    stripeMock.refundsCreate.mockResolvedValue({ id: 're_test' })
    await refundPayment('ch_test', 'acct_xxx')
    expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
      { charge: 'ch_test' },
      { stripeAccount: 'acct_xxx' }
    )
  })
})
