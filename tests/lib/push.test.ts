import { describe, it, expect, vi, beforeEach } from 'vitest'

const webpushMock = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock('web-push', () => ({
  default: webpushMock,
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import { sendPushToStore, sendPushToOrder } from '@/lib/push'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'

function mockSupabaseSubs(rows: Array<{ endpoint: string; p256dh: string; auth: string }> | null) {
  const deleteEq = vi.fn().mockResolvedValue({ error: null })
  const deleteIn = vi.fn().mockReturnValue({ in: deleteEq })
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'push_subscriptions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: rows ?? null, error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          in: deleteIn,
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)
  return { fromMock, deleteIn }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendPushToStore', () => {
  it('returns early when no subscriptions', async () => {
    mockSupabaseSubs([])
    await sendPushToStore(STORE_ID, { title: 't', body: 'b' })
    expect(webpushMock.sendNotification).not.toHaveBeenCalled()
  })

  it('sends notifications to all subscriptions with payload', async () => {
    mockSupabaseSubs([
      { endpoint: 'https://e1', p256dh: 'p1', auth: 'a1' },
      { endpoint: 'https://e2', p256dh: 'p2', auth: 'a2' },
    ])
    webpushMock.sendNotification.mockResolvedValue({ statusCode: 201 })

    await sendPushToStore(STORE_ID, { title: 'New', body: 'order', url: 'http://x' })

    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(2)
    const firstCall = webpushMock.sendNotification.mock.calls[0]
    expect(firstCall[0]).toEqual({
      endpoint: 'https://e1',
      keys: { p256dh: 'p1', auth: 'a1' },
    })
    // payload は JSON 文字列で送られる
    expect(JSON.parse(firstCall[1])).toEqual({ title: 'New', body: 'order', url: 'http://x' })
  })

  it('removes 410 (expired) subscriptions from DB', async () => {
    const { deleteIn } = mockSupabaseSubs([
      { endpoint: 'https://valid', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://gone',  p256dh: 'p', auth: 'a' },
    ])
    webpushMock.sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint === 'https://gone') {
        return Promise.reject({ statusCode: 410 })
      }
      return Promise.resolve({ statusCode: 201 })
    })

    await sendPushToStore(STORE_ID, { title: 't', body: 'b' })

    // 410 のみ削除
    expect(deleteIn).toHaveBeenCalledWith('endpoint', ['https://gone'])
  })

  it('does not delete subscriptions for non-410 errors', async () => {
    const { deleteIn } = mockSupabaseSubs([
      { endpoint: 'https://e', p256dh: 'p', auth: 'a' },
    ])
    webpushMock.sendNotification.mockRejectedValue({ statusCode: 500 })

    await sendPushToStore(STORE_ID, { title: 't', body: 'b' })
    expect(deleteIn).not.toHaveBeenCalled()
  })

  it('initializes VAPID details on each call', async () => {
    mockSupabaseSubs([])
    await sendPushToStore(STORE_ID, { title: 't', body: 'b' })
    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith(
      expect.stringContaining('mailto:'),
      expect.any(String),
      expect.any(String)
    )
  })
})

// sendPushToOrder は order_push_subscriptions テーブルを使う点のみ異なる
describe('sendPushToOrder', () => {
  function mockOrderSubs(rows: Array<{ endpoint: string; p256dh: string; auth: string }> | null) {
    const deleteIn = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'order_push_subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: rows ?? null, error: null }),
            }),
            delete: vi.fn().mockReturnValue({ in: deleteIn }),
          }
        }
        throw new Error(`unexpected table: ${table}`)
      }),
    } as never)
    return { deleteIn }
  }

  it('queries order_push_subscriptions by order_id', async () => {
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({ from: fromMock } as never)

    await sendPushToOrder(ORDER_ID, { title: 't', body: 'b' })

    expect(fromMock).toHaveBeenCalledWith('order_push_subscriptions')
    const eqCall = fromMock.mock.results[0].value.select().eq
    expect(eqCall).toHaveBeenCalledWith('order_id', ORDER_ID)
  })

  it('sends notification to subscriber', async () => {
    mockOrderSubs([{ endpoint: 'https://ep', p256dh: 'pk', auth: 'ak' }])
    webpushMock.sendNotification.mockResolvedValue({ statusCode: 201 })

    await sendPushToOrder(ORDER_ID, { title: '準備完了', body: 'お越しください' })

    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(1)
    const [sub, payloadStr] = webpushMock.sendNotification.mock.calls[0]
    expect(sub).toEqual({ endpoint: 'https://ep', keys: { p256dh: 'pk', auth: 'ak' } })
    expect(JSON.parse(payloadStr)).toMatchObject({ title: '準備完了', body: 'お越しください' })
  })

  it('removes 410 expired subscriptions from order_push_subscriptions', async () => {
    const { deleteIn } = mockOrderSubs([
      { endpoint: 'https://alive', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://dead',  p256dh: 'p', auth: 'a' },
    ])
    webpushMock.sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint === 'https://dead'
        ? Promise.reject({ statusCode: 410 })
        : Promise.resolve({ statusCode: 201 })
    )

    await sendPushToOrder(ORDER_ID, { title: 't', body: 'b' })

    expect(deleteIn).toHaveBeenCalledWith('endpoint', ['https://dead'])
  })
})
