import { describe, it, expect } from 'vitest'
import { createSessionToken, verifySessionToken } from '@/lib/session'

const basePayload = {
  email: 'admin@example.com',
  storeId: '11111111-1111-1111-1111-111111111111',
  role: 'owner',
}

describe('session token', () => {
  it('round-trips a valid token', () => {
    const exp = Date.now() + 60_000
    const token = createSessionToken({ ...basePayload, exp })
    const verified = verifySessionToken(token)
    expect(verified).toEqual({ ...basePayload, exp })
  })

  it('rejects tokens with tampered payload', () => {
    const exp = Date.now() + 60_000
    const token = createSessionToken({ ...basePayload, exp })
    const [, sig] = token.split('.')

    // payload を別のものに差し替え（署名はそのまま）
    const fakePayload = Buffer.from(
      JSON.stringify({ ...basePayload, role: 'owner', storeId: '22222222-2222-2222-2222-222222222222', exp })
    ).toString('base64url')
    const tampered = `${fakePayload}.${sig}`

    expect(verifySessionToken(tampered)).toBeNull()
  })

  it('rejects tokens with tampered signature', () => {
    const exp = Date.now() + 60_000
    const token = createSessionToken({ ...basePayload, exp })
    const [data] = token.split('.')
    const tampered = `${data}.${'0'.repeat(64)}`

    expect(verifySessionToken(tampered)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('')).toBeNull()
    expect(verifySessionToken('justonepart')).toBeNull()
    expect(verifySessionToken('a.b.c')).toBeNull()
    expect(verifySessionToken('!.!')).toBeNull()
  })

  it('rejects expired tokens', () => {
    const exp = Date.now() - 1000
    const token = createSessionToken({ ...basePayload, exp })
    expect(verifySessionToken(token)).toBeNull()
  })

  it('rejects token with mismatched signature length without throwing', () => {
    // timingSafeEqual は長さが違うと throw するが、catch で null を返す実装
    const exp = Date.now() + 60_000
    const token = createSessionToken({ ...basePayload, exp })
    const [data] = token.split('.')
    const tampered = `${data}.short` // 64文字でない
    expect(() => verifySessionToken(tampered)).not.toThrow()
    expect(verifySessionToken(tampered)).toBeNull()
  })
})
