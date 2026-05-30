import { describe, it, expect, vi, beforeEach } from 'vitest'

// L3 of 5 重防御 (docs/payment-design-legal.md):
//   createPayment は stripeConnectedAccountId が未設定なら throw する。
//   これにより、Connect 未接続店舗での決済が DB / 公開フィルタ / admin
//   ガードをすべて素通りした場合でも、最終的に決済が成立しない。

// Stripe SDK の paymentIntents.create を mock
const paymentIntentsCreateMock = vi.fn()

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: { create: paymentIntentsCreateMock },
    refunds: { create: vi.fn() },
  }),
}))

describe('createPayment — Connect 必須ガード (L3)', () => {
  beforeEach(() => {
    paymentIntentsCreateMock.mockReset()
    paymentIntentsCreateMock.mockResolvedValue({
      client_secret: 'cs_test_123',
      id: 'pi_test_123',
    })
  })

  it('stripeConnectedAccountId = null なら throw', async () => {
    const { createPayment } = await import('@/lib/payment')
    await expect(createPayment(1000, 'order_1', null)).rejects.toThrow(
      /Stripe Connect アカウントが未設定/,
    )
    expect(paymentIntentsCreateMock).not.toHaveBeenCalled()
  })

  it('stripeConnectedAccountId = undefined なら throw', async () => {
    const { createPayment } = await import('@/lib/payment')
    await expect(createPayment(1000, 'order_1', undefined)).rejects.toThrow(
      /Stripe Connect アカウントが未設定/,
    )
    expect(paymentIntentsCreateMock).not.toHaveBeenCalled()
  })

  it('stripeConnectedAccountId = "" (空文字) なら throw', async () => {
    const { createPayment } = await import('@/lib/payment')
    await expect(createPayment(1000, 'order_1', '')).rejects.toThrow(
      /Stripe Connect アカウントが未設定/,
    )
    expect(paymentIntentsCreateMock).not.toHaveBeenCalled()
  })

  it('stripeConnectedAccountId が有効値なら Destination Charges パラメータで PI 作成', async () => {
    const { createPayment } = await import('@/lib/payment')
    const result = await createPayment(1000, 'order_1', 'acct_connected', null)

    expect(result.clientSecret).toBe('cs_test_123')
    expect(result.paymentIntentId).toBe('pi_test_123')
    expect(paymentIntentsCreateMock).toHaveBeenCalledTimes(1)

    const callArg = paymentIntentsCreateMock.mock.calls[0][0]
    expect(callArg.amount).toBe(1000)
    expect(callArg.currency).toBe('jpy')
    // 6.4% = 64
    expect(callArg.application_fee_amount).toBe(64)
    expect(callArg.transfer_data).toEqual({ destination: 'acct_connected' })
    expect(callArg.metadata).toEqual({ order_id: 'order_1' })
  })

  it('receiptEmail が指定されれば PaymentIntent に渡る', async () => {
    const { createPayment } = await import('@/lib/payment')
    await createPayment(1000, 'order_1', 'acct_connected', 'foo@example.com')
    const callArg = paymentIntentsCreateMock.mock.calls[0][0]
    expect(callArg.receipt_email).toBe('foo@example.com')
  })
})
