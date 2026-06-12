/**
 * lib/dal.ts verifyStoreSession() の MFA AAL enforcement 検証。
 *
 * code-review 指摘 (2026-06-11):
 * H-1: `getAuthenticatorAssuranceLevel` の error 時に fail-open すると、
 *      Supabase 一時障害で MFA 強制が skip されて AAL1 のまま admin に
 *      アクセスできる脆弱性。
 *
 * 期待する fail-closed 挙動:
 * - aalData が undefined または error → /admin/login へ redirect
 * - nextLevel=aal2 (factor 登録済) で currentLevel=aal1 → /admin/mfa-challenge
 * - currentLevel=aal2 (challenge 完了) → 通常 flow
 * - nextLevel=aal1 (factor 未登録) → 通常 flow (移行期間)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirectMock = vi.fn((url: string) => {
  // next/navigation の redirect は throw で flow を中断する
  throw new Error(`__REDIRECT__:${url}`)
})

const getUserMock = vi.fn()
const getAALMock = vi.fn()
const fromMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
  }
})

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: getUserMock,
      mfa: {
        getAuthenticatorAssuranceLevel: getAALMock,
      },
    },
    from: fromMock,
  }),
}))

// import after mocks
const { verifyStoreSession } = await import('@/lib/dal')

function setUser(user: { id: string; email: string } | null) {
  getUserMock.mockResolvedValue({
    data: { user },
    error: user ? null : new Error('no user'),
  })
}

function setMembership() {
  // store_members から membership を返す chainable mock
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: { store_id: 'store-1', role: 'owner' },
            error: null,
          }),
      }),
    }),
  })
}

describe('verifyStoreSession MFA fail-closed enforcement (H-1)', () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getUserMock.mockClear()
    getAALMock.mockClear()
    fromMock.mockClear()
    setUser({ id: 'u1', email: 'owner@example.com' })
    setMembership()
  })

  it('getAuthenticatorAssuranceLevel が error を返したら /admin/login へ fail-closed', async () => {
    getAALMock.mockResolvedValue({
      data: null,
      error: new Error('network failure'),
    })
    await expect(verifyStoreSession()).rejects.toThrow('__REDIRECT__:/admin/login')
  })

  it('getAuthenticatorAssuranceLevel が data=null を返したら /admin/login へ fail-closed', async () => {
    getAALMock.mockResolvedValue({ data: null, error: null })
    await expect(verifyStoreSession()).rejects.toThrow('__REDIRECT__:/admin/login')
  })

  it('factor 登録済 (nextLevel=aal2) で AAL1 のままなら /admin/mfa-challenge へ', async () => {
    getAALMock.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    await expect(verifyStoreSession()).rejects.toThrow('__REDIRECT__:/admin/mfa-challenge')
  })

  it('AAL2 達成済なら通常 flow を通過する (membership 取得まで進む)', async () => {
    getAALMock.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    })
    const session = await verifyStoreSession()
    expect(session.userId).toBe('u1')
    expect(session.email).toBe('owner@example.com')
    expect(session.storeId).toBe('store-1')
    expect(session.role).toBe('owner')
  })

  it('factor 未登録 (nextLevel=aal1) なら AAL1 でも通常 flow (移行期間)', async () => {
    getAALMock.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    })
    const session = await verifyStoreSession()
    expect(session.userId).toBe('u1')
  })

  it('skipMfaCheck=true なら MFA enforcement を skip (mfa-challenge page 用)', async () => {
    getAALMock.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    const session = await verifyStoreSession({ skipMfaCheck: true })
    expect(session.userId).toBe('u1')
    // MFA check 自体が呼ばれないことも確認
    expect(getAALMock).not.toHaveBeenCalled()
  })
})
