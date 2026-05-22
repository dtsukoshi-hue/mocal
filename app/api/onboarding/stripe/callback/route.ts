import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { verifyState } from '@/lib/oauth-state'

// Stripe Connect OAuth コールバック
// GET /api/onboarding/stripe/callback?code=...&state=...
//
// state は connect/route.ts と同じ lib/oauth-state.ts の primitive で検証。
// HMAC キーは SESSION_SECRET、TTL 10 分。
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=invalid_callback`)
  }

  const verified = verifyState(state)
  if (!verified) {
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=invalid_state`)
  }
  const { storeId } = verified

  // セッション確認：ログイン済みかつ storeId のオーナーであることを検証
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/admin/login`)
  }

  const supabase = createServiceClient()
  const { data: membership } = await supabase
    .from('store_members')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=unauthorized`)
  }

  // code → stripe_account_id 交換
  let stripeAccountId: string
  try {
    const stripe = getStripe()
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })
    stripeAccountId = response.stripe_user_id!
  } catch (err) {
    console.error('[stripe/callback] token 交換失敗:', err)
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=token_exchange_failed`)
  }

  // stores テーブルに stripe_account_id を保存
  const { error: updateErr } = await supabase
    .from('stores')
    .update({ stripe_account_id: stripeAccountId })
    .eq('id', storeId)

  if (updateErr) {
    console.error('[stripe/callback] DB 更新失敗:', updateErr)
    return NextResponse.redirect(`${appUrl}/admin/settings?stripe_error=db_error`)
  }

  return NextResponse.redirect(`${appUrl}/admin/settings?stripe_connected=1`)
}
