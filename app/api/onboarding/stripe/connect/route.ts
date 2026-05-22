import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { verifyStoreSession } from '@/lib/dal'
import { signState } from '@/lib/oauth-state'

// Stripe Connect OAuth 開始
// GET /api/onboarding/stripe/connect → Stripe の OAuth ページへリダイレクト
//
// state は lib/oauth-state.ts で signState / verifyState を共有。
// HMAC キーは SESSION_SECRET、iat / exp (10 分) で replay 防止。
export async function GET() {
  const session = await verifyStoreSession()

  const clientId = process.env.STRIPE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'STRIPE_CLIENT_ID が設定されていません。' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/onboarding/stripe/callback`

  // nonce + HMAC 署名 + iat/exp で CSRF / 改ざん / replay を防ぐ
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
