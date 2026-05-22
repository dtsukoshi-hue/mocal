/**
 * lib/oauth-state.ts (Stripe Connect OAuth state の sign/verify) の unit test。
 * F-04 (dev-secret fallback 削除) / F-11 (iat/exp 追加) の検証。
 */

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { signState, verifyState, _internal } from '@/lib/oauth-state'

describe('signState / verifyState — round trip', () => {
  it('sign したものを verify すれば元の storeId が返る', () => {
    const signed = signState({ storeId: 'store-abc', nonce: 'n1' })
    const out = verifyState(signed)
    expect(out).toEqual({ storeId: 'store-abc' })
  })

  it('違う storeId / nonce で sign すれば違う state になる', () => {
    const a = signState({ storeId: 'store-a', nonce: 'n1' })
    const b = signState({ storeId: 'store-b', nonce: 'n1' })
    expect(a).not.toBe(b)
  })
})

describe('verifyState — 署名検証 (F-04)', () => {
  it('改ざんされた state は null を返す', () => {
    const signed = signState({ storeId: 'store-abc', nonce: 'n1' })
    // base64url decode → tamper → re-encode
    const decoded = JSON.parse(Buffer.from(signed, 'base64url').toString('utf-8'))
    decoded.storeId = 'attacker-store'
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    expect(verifyState(tampered)).toBeNull()
  })

  it('sig フィールドが欠けたら null', () => {
    const tampered = Buffer.from(JSON.stringify({
      storeId: 'x', nonce: 'n', iat: Math.floor(Date.now()/1000),
    })).toString('base64url')
    expect(verifyState(tampered)).toBeNull()
  })

  it('base64url ではない壊れた文字列なら null', () => {
    expect(verifyState('not_a_state_at_all')).toBeNull()
    expect(verifyState('')).toBeNull()
  })

  it('別の secret で署名された state は null（dev-secret fallback の不存在を verify）', () => {
    // SESSION_SECRET が無い state を試す: 別 secret で sig を作る
    const originalSecret = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'other-session-secret-of-32-chars-len'
    const signedWithOther = signState({ storeId: 'store-abc', nonce: 'n1' })
    process.env.SESSION_SECRET = originalSecret
    // 元の secret に戻して verify → sig 不一致で null
    expect(verifyState(signedWithOther)).toBeNull()
  })
})

describe('verifyState — TTL / iat 検証 (F-11)', () => {
  it('iat が無い state は null', () => {
    const tampered = Buffer.from(JSON.stringify({
      storeId: 'x', nonce: 'n', sig: 'deadbeef',
    })).toString('base64url')
    expect(verifyState(tampered)).toBeNull()
  })

  it('iat が TTL より古い場合は null（replay 防止）', () => {
    // STATE_TTL_SEC を上回る過去 iat で sign を再現
    const oldIat = Math.floor(Date.now() / 1000) - _internal.STATE_TTL_SEC - 1
    const payload = { storeId: 'x', nonce: 'n', iat: oldIat }
    const secret = process.env.SESSION_SECRET!
    const sig = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
    const expired = Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url')
    expect(verifyState(expired)).toBeNull()
  })

  it('iat が未来すぎる場合も null（clock skew tolerance 超過）', () => {
    const futureIat = Math.floor(Date.now() / 1000) + _internal.CLOCK_SKEW_TOLERANCE_SEC + 10
    const payload = { storeId: 'x', nonce: 'n', iat: futureIat }
    const secret = process.env.SESSION_SECRET!
    const sig = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
    const skewed = Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url')
    expect(verifyState(skewed)).toBeNull()
  })
})

describe('signState / verifyState — env チェック (F-04)', () => {
  it('SESSION_SECRET が無いと throw', () => {
    const original = process.env.SESSION_SECRET
    delete process.env.SESSION_SECRET
    try {
      expect(() => signState({ storeId: 'x', nonce: 'n' })).toThrow(/SESSION_SECRET/)
    } finally {
      process.env.SESSION_SECRET = original
    }
  })

  it('SESSION_SECRET が短すぎる (<16) と throw', () => {
    const original = process.env.SESSION_SECRET
    process.env.SESSION_SECRET = 'tooshort'
    try {
      expect(() => signState({ storeId: 'x', nonce: 'n' })).toThrow(/SESSION_SECRET/)
    } finally {
      process.env.SESSION_SECRET = original
    }
  })
})
