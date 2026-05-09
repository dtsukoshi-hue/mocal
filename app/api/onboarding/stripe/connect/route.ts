import { NextRequest, NextResponse } from 'next/server'
import { verifyStoreSession } from '@/lib/dal'

// Stripe Connect OAuth 開始
// GET /api/onboarding/stripe/connect → Stripe の OAuth ページへリダイレクト
export async function GET(_request: NextRequest) {
  const session = await verifyStoreSession()

  const clientId = process.env.STRIPE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'STRIPE_CLIENT_ID が設定されていません。' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/onboarding/stripe/callback`

  // state にストアIDを入れて CSRF 対策（本番では署名付きトークンを推奨）
  const state = Buffer.from(JSON.stringify({ storeId: session.storeId })).toString('base64url')

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
