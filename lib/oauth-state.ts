import 'server-only'
import { createHmac } from 'crypto'

/**
 * Stripe Connect OAuth の `state` パラメータの sign / verify。
 *
 * 目的:
 *  - CSRF 対策: 攻撃者が偽の state で callback を叩いて店舗 A を
 *    攻撃者の Stripe アカウントに紐付ける、を防ぐ
 *  - Replay 対策: 同一 state を後日使い回す攻撃を防ぐ (iat / exp で TTL)
 *  - 改ざん検出: HMAC-SHA256 で sig を検証
 *
 * F-04 修正: 旧実装は `process.env.STRIPE_WEBHOOK_SECRET ?? process.env.NEXTAUTH_SECRET
 *           ?? 'dev-secret'` という fallback を持っており、env 設定ミス時に
 *           ハードコード値で署名するリスクがあった。SESSION_SECRET に集約。
 * F-11 修正: 旧実装は iat / exp を持たず replay 可能だった。10 分 TTL を追加。
 */

const STATE_TTL_SEC = 10 * 60  // 10 分
const CLOCK_SKEW_TOLERANCE_SEC = 60

interface StatePayload {
  storeId: string
  nonce: string
  iat: number    // Unix seconds, issued at
}

interface SignedState extends StatePayload {
  sig: string
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET is required (>=16 chars) for OAuth state HMAC. '
      + 'See lib/env.ts REQUIRED_VARS.'
    )
  }
  return secret
}

export function signState(input: { storeId: string; nonce: string }): string {
  const secret = getSecret()
  const payload: StatePayload = {
    storeId: input.storeId,
    nonce:   input.nonce,
    iat:     Math.floor(Date.now() / 1000),
  }
  const sig = createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')
  const signed: SignedState = { ...payload, sig }
  return Buffer.from(JSON.stringify(signed)).toString('base64url')
}

export function verifyState(stateParam: string): { storeId: string } | null {
  try {
    const secret = getSecret()
    const raw = Buffer.from(stateParam, 'base64url').toString('utf-8')
    const decoded = JSON.parse(raw) as Partial<SignedState>

    if (
      !decoded.sig ||
      !decoded.storeId ||
      typeof decoded.iat !== 'number' ||
      !decoded.nonce
    ) {
      return null
    }

    // Expiration check (F-11)
    const now = Math.floor(Date.now() / 1000)
    if (now - decoded.iat > STATE_TTL_SEC) return null
    if (decoded.iat > now + CLOCK_SKEW_TOLERANCE_SEC) return null // future-dated

    // Signature check (timing-safe)
    const payload: StatePayload = {
      storeId: decoded.storeId,
      nonce:   decoded.nonce,
      iat:     decoded.iat,
    }
    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex')
    const sig = decoded.sig
    if (sig.length !== expected.length) return null
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    if (diff !== 0) return null

    return { storeId: payload.storeId }
  } catch {
    return null
  }
}

// Test 用 (本番では使わない)
export const _internal = { STATE_TTL_SEC, CLOCK_SKEW_TOLERANCE_SEC }
