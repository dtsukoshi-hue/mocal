/**
 * lib/customer-session.ts の unit test。
 *
 * 実 Supabase は叩かず、createSupabaseServerClient を mock して
 * 「auth.getUser / auth.signInAnonymously が期待通り呼ばれるか」を verify。
 *
 * E2E な session 確保の動作は tests/security/anon-rest-access.test.ts と
 * 本番 smoke で担保（unit test では fetch/cookie の細部は touch しない）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// createSupabaseServerClient の mock を vi.hoisted で先に作る
const mocks = vi.hoisted(() => {
  return {
    getUser: vi.fn(),
    signInAnonymously: vi.fn(),
  }
})

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      signInAnonymously: mocks.signInAnonymously,
    },
  }),
}))

import { ensureCustomerSession, getCustomerSession } from '@/lib/customer-session'

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.signInAnonymously.mockReset()
})

describe('ensureCustomerSession', () => {
  it('既存セッションがあればその user を返し、sign-in は呼ばれない', async () => {
    const existing = { id: 'user-1', email: null } as never
    mocks.getUser.mockResolvedValue({ data: { user: existing }, error: null })

    const user = await ensureCustomerSession()

    expect(user).toBe(existing)
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('セッションが無ければ signInAnonymously を呼んで新規 user を返す', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const newUser = { id: 'anon-1', email: null } as never
    mocks.signInAnonymously.mockResolvedValue({ data: { user: newUser, session: {} }, error: null })

    const user = await ensureCustomerSession()

    expect(user).toBe(newUser)
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce()
  })

  it('signInAnonymously が error を返したら throw する', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.signInAnonymously.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'rate limit exceeded' },
    })

    await expect(ensureCustomerSession()).rejects.toThrow(/rate limit exceeded/)
  })

  it('signInAnonymously が user を返さない（理論上は起きないが）場合も throw', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    mocks.signInAnonymously.mockResolvedValue({ data: { user: null, session: null }, error: null })

    await expect(ensureCustomerSession()).rejects.toThrow(/no user returned/)
  })
})

describe('getCustomerSession', () => {
  it('既存セッションがあれば user を返す', async () => {
    const existing = { id: 'user-1' } as never
    mocks.getUser.mockResolvedValue({ data: { user: existing }, error: null })

    const user = await getCustomerSession()

    expect(user).toBe(existing)
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })

  it('セッションが無ければ null を返す。sign-in は呼ばない（MAU 浪費防止）', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const user = await getCustomerSession()

    expect(user).toBeNull()
    expect(mocks.signInAnonymously).not.toHaveBeenCalled()
  })
})
