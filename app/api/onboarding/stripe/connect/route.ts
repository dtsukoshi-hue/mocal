import { NextResponse } from 'next/server'
import { createHmac, randomBytes } from 'crypto'
import { verifyStoreSession } from '@/lib/dal'

// state を HMAC-SHA256 で署名して CSRF 対策
// secret は STRIPE_WEBHOOK_SECRET を流用（別途 CONNECT_STATE_SECRET を設けても可）
function signState(payload: object): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'dev-secret'
  const json = JSON.stringify(payload)
  const sig = createHmac('sha256', secret).update(json).digest('hex')
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url')
}

// Stripe Connect OAuth 開始
// GET /api/onboarding/stripe/connect → Stripe の OAuth ページへリダイレクト
export async function GET() {
  const session = await verifyStoreSession()

  const clientId = process.env.STRIPE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'STRIPE_CLIENT_ID が設定されていません。' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/onboarding/stripe/callback`

  // nonce で replay 攻撃を防ぎ、HMAC 署名で state 改ざんを検出
  const nonce = randomBytes(16).toString('hex')
  const state = signState({ storeId: session.storeId, nonce })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_write',
    redirect_uri: redirectUri,
    state,
    // 'suggested_capabilities[]': 'card_payments', // 必要に応じて
  })

  return NextResponse.redirect(
    `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  )
}
