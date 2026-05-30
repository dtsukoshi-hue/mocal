import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// L4 of 5 重防御 (docs/payment-design-legal.md):
//   PATCH /api/admin/store で is_open=true への切替時に
//   stripe_account_id が NULL なら 422 を返す。
//   Connect 未接続店舗を公開状態に出来ないようにする。

const supabaseServiceMock = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: () => supabaseServiceMock,
}))

vi.mock('@/lib/dal', () => ({
  getStoreSession: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { PATCH } from '@/app/api/admin/store/route'
import { getStoreSession } from '@/lib/dal'

const STORE_ID = '11111111-1111-1111-1111-111111111111'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/admin/store', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

function makeStoreSelectChain(storeRow: { stripe_account_id: string | null } | null) {
  // .select('stripe_account_id').eq('id', ...).single() → { data: storeRow }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: storeRow }),
  }
}

function makeUpdateChain(error?: { code: string } | null) {
  // .update(...).eq('id', ...) → { error }
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: error ?? null }),
  }
}

describe('PATCH /api/admin/store — Connect 必須ガード (L4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStoreSession).mockResolvedValue({
      storeId: STORE_ID,
      role: 'owner',
      userId: 'user_1',
    } as never)
  })

  it('is_open=true 切替時に stripe_account_id=NULL なら 422', async () => {
    // 1 回目: stripe_account_id check (NULL)
    supabaseServiceMock.from.mockReturnValueOnce(makeStoreSelectChain({ stripe_account_id: null }))

    const res = await PATCH(makeRequest({ is_open: true }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('connect_required')
    expect(body.error).toMatch(/Stripe Connect/)
  })

  it('is_open=true 切替時に stripe_account_id 設定済なら通常更新 (200)', async () => {
    // 1 回目: stripe_account_id check (設定済)
    supabaseServiceMock.from.mockReturnValueOnce(
      makeStoreSelectChain({ stripe_account_id: 'acct_connected' }),
    )
    // 2 回目: stores update
    supabaseServiceMock.from.mockReturnValueOnce(makeUpdateChain())
    // 3 回目: slug fetch (revalidate のため)
    supabaseServiceMock.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { slug: null } }),
    })

    const res = await PATCH(makeRequest({ is_open: true }))
    expect(res.status).toBe(200)
  })

  it('is_open=false への切替は Connect チェック対象外 (200)', async () => {
    // is_open=false の場合は Connect チェック を skip → 直接 update
    supabaseServiceMock.from.mockReturnValueOnce(makeUpdateChain())
    supabaseServiceMock.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { slug: null } }),
    })

    const res = await PATCH(makeRequest({ is_open: false }))
    expect(res.status).toBe(200)
  })

  it('未認証 (getStoreSession=null) なら 401', async () => {
    vi.mocked(getStoreSession).mockResolvedValueOnce(null)
    const res = await PATCH(makeRequest({ is_open: true }))
    expect(res.status).toBe(401)
  })
})
