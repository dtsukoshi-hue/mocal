import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { stripe } from '@/lib/stripe'
import { getEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

// Stripe Connect (Express) アカウント作成 + オンボーディングリンク発行
//
// 1. 店舗に既存の Connect アカウントがなければ Stripe.accounts.create で作成し
//    stores.stripe_account_id を保存
// 2. AccountLink を発行してフロントへ URL を返す（顧客はそこに飛んで Stripe の
//    オンボーディングフォームを完了する）
// 3. 完了後 return_url に戻り、status を再取得して反映する

export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  // type: 'onboarding' = 新規登録 / 'update' = 既存アカウントの編集再送
  const linkType = body.type === 'update' ? 'account_onboarding' : 'account_onboarding'

  const supabase = createServiceClient()
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id, stripe_account_id')
    .eq('id', session.storeId)
    .single()

  if (storeError || !store) {
    logger.error('store fetch failed', { storeId: session.storeId, error: storeError?.message })
    return NextResponse.json({ error: '店舗情報の取得に失敗しました。' }, { status: 500 })
  }

  let accountId = store.stripe_account_id

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'JP',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { store_id: store.id },
      })
      accountId = account.id

      const { error: updateErr } = await supabase
        .from('stores')
        .update({ stripe_account_id: accountId })
        .eq('id', store.id)

      if (updateErr) {
        logger.error('store stripe_account_id save failed', { storeId: store.id, error: updateErr.message })
        return NextResponse.json({ error: '保存に失敗しました。' }, { status: 500 })
      }
    } catch (e) {
      logger.error('stripe account create failed', { storeId: store.id, error: String(e) })
      return NextResponse.json({ error: 'Stripe アカウントの作成に失敗しました。' }, { status: 500 })
    }
  }

  const baseUrl = getEnv('NEXT_PUBLIC_APP_URL')

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/admin/settings?stripe=refresh`,
      return_url: `${baseUrl}/admin/settings?stripe=return`,
      type: linkType,
    })
    return NextResponse.json({ url: link.url })
  } catch (e) {
    logger.error('stripe account link failed', { storeId: store.id, error: String(e) })
    return NextResponse.json({ error: 'オンボーディングリンクの発行に失敗しました。' }, { status: 500 })
  }
}

// GET: 現在の Connect アカウント状態を返す
export async function GET() {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: store } = await supabase
    .from('stores')
    .select('stripe_account_id')
    .eq('id', session.storeId)
    .single()

  if (!store?.stripe_account_id) {
    return NextResponse.json({ connected: false })
  }

  try {
    const account = await stripe.accounts.retrieve(store.stripe_account_id)
    return NextResponse.json({
      connected: true,
      accountId: account.id,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    })
  } catch (e) {
    logger.error('stripe account retrieve failed', { storeId: session.storeId, error: String(e) })
    return NextResponse.json({ connected: true, error: 'アカウント情報の取得に失敗しました。' })
  }
}
