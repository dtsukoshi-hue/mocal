/**
 * #34 anonymous user cleanup cron の unit test。
 * Supabase admin API をモックして delete 対象判定ロジックを verify する。
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  listUsers:  vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => ({
    auth: { admin: { listUsers: mocks.listUsers, deleteUser: mocks.deleteUser } },
  })),
}))

import { GET } from '@/app/api/cron/cleanup-anonymous-users/route'

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET
const ORIGINAL_ENABLED     = process.env.CLEANUP_ANON_USERS_ENABLED

function makeReq(opts: { auth?: string; dry?: boolean } = {}): NextRequest {
  const url = new URL('http://localhost/api/cron/cleanup-anonymous-users')
  if (opts.dry) url.searchParams.set('dry', '1')
  const headers: Record<string, string> = {}
  if (opts.auth) headers['authorization'] = opts.auth
  return new NextRequest(url, { method: 'GET', headers })
}

/** "N日前" の ISO string を返す */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

beforeEach(() => {
  mocks.listUsers.mockReset()
  mocks.deleteUser.mockReset()
  process.env.CRON_SECRET = 'test-cron-secret'
  process.env.CLEANUP_ANON_USERS_ENABLED = '1'
})

describe('GET /api/cron/cleanup-anonymous-users — auth', () => {
  it('returns 401 when CRON_SECRET is set but no Authorization header', async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 200 with correct Bearer token', async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(200)
  })

  it('returns 401 with wrong Bearer token', async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    const res = await GET(makeReq({ auth: 'Bearer wrong-secret' }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/cron/cleanup-anonymous-users — deletion logic', () => {
  it('deletes anonymous users older than 90 days', async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'anon-old',  is_anonymous: true,  last_sign_in_at: daysAgo(120), created_at: daysAgo(120) },
          { id: 'anon-fresh', is_anonymous: true, last_sign_in_at: daysAgo(30),  created_at: daysAgo(30)  },
          { id: 'real-old',  is_anonymous: false, last_sign_in_at: daysAgo(120), created_at: daysAgo(120) },
        ],
      },
      error: null,
    })
    mocks.deleteUser.mockResolvedValue({ error: null })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deleted).toBe(1)
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1)
    expect(mocks.deleteUser).toHaveBeenCalledWith('anon-old')
  })

  it('never deletes non-anonymous users (real users / store owners)', async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'real-1', is_anonymous: false, last_sign_in_at: daysAgo(365), created_at: daysAgo(365) },
          { id: 'real-2', is_anonymous: undefined, last_sign_in_at: daysAgo(365), created_at: daysAgo(365) },
        ],
      },
      error: null,
    })
    mocks.deleteUser.mockResolvedValue({ error: null })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deleted).toBe(0)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('uses last_sign_in_at if present, else falls back to created_at', async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          // last_sign_in_at が 60 日前 → 残す（90 日未満）
          { id: 'a', is_anonymous: true, last_sign_in_at: daysAgo(60), created_at: daysAgo(180) },
          // last_sign_in_at が null → created_at で判定（120 日前なので削除）
          { id: 'b', is_anonymous: true, last_sign_in_at: null, created_at: daysAgo(120) },
          // last_sign_in_at が null かつ created_at も 30 日前 → 残す
          { id: 'c', is_anonymous: true, last_sign_in_at: null, created_at: daysAgo(30) },
        ],
      },
      error: null,
    })
    mocks.deleteUser.mockResolvedValue({ error: null })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))

    expect(res.status).toBe(200)
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1)
    expect(mocks.deleteUser).toHaveBeenCalledWith('b')
  })

  it('limits deletion to BATCH_SIZE per run', async () => {
    // 150 件の削除候補（90 日以上前の anonymous user）
    const users = Array.from({ length: 150 }, (_, i) => ({
      id: `anon-${i}`, is_anonymous: true, last_sign_in_at: daysAgo(100), created_at: daysAgo(100),
    }))
    mocks.listUsers.mockResolvedValue({ data: { users }, error: null })
    mocks.deleteUser.mockResolvedValue({ error: null })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deleted).toBe(100)         // BATCH_SIZE
    expect(body.deferred).toBe(50)         // 残り 50 は次回持ち越し
    expect(mocks.deleteUser).toHaveBeenCalledTimes(100)
  })
})

describe('GET /api/cron/cleanup-anonymous-users — dry run / feature flag', () => {
  it('dry-run mode returns candidates without deleting', async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'a', is_anonymous: true, last_sign_in_at: daysAgo(120), created_at: daysAgo(120) },
          { id: 'b', is_anonymous: true, last_sign_in_at: daysAgo(120), created_at: daysAgo(120) },
        ],
      },
      error: null,
    })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret', dry: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(true)
    expect(body.candidates).toBe(2)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('feature flag off treats as dry-run (no actual deletion)', async () => {
    process.env.CLEANUP_ANON_USERS_ENABLED = '0'
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: 'a', is_anonymous: true, last_sign_in_at: daysAgo(120), created_at: daysAgo(120) },
        ],
      },
      error: null,
    })

    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(true)
    expect(body.enabled).toBe(false)
    expect(body.candidates).toBe(1)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('returns 500 when listUsers fails', async () => {
    mocks.listUsers.mockResolvedValue({ data: null, error: { code: 'auth_error', message: 'listUsers failed' } })
    const res = await GET(makeReq({ auth: 'Bearer test-cron-secret' }))
    expect(res.status).toBe(500)
  })
})

// 後片付け（他のテストへの env 影響を避ける）
afterAll(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
  if (ORIGINAL_ENABLED === undefined) delete process.env.CLEANUP_ANON_USERS_ENABLED
  else process.env.CLEANUP_ANON_USERS_ENABLED = ORIGINAL_ENABLED
})
