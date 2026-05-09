import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'

// POST: 購読登録
// body: { subscription: PushSubscriptionJSON, orderId?: string, storeId?: string }
export async function POST(request: NextRequest) {
  let body: {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
    orderId?: string
    storeId?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const { subscription, orderId, storeId } = body

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: '購読情報が不正です。' }, { status: 400 })
  }

  // orderId と storeId の排他チェック
  if ((!orderId && !storeId) || (orderId && storeId)) {
    return NextResponse.json({ error: 'orderId か storeId のいずれか一方を指定してください。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (storeId) {
    // 店舗購読：ログイン確認 + 店舗メンバーシップ確認
    const supabaseUser = await createSupabaseServerClient()
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
    }

    const { data: membership, error: memberErr } = await supabase
      .from('store_members')
      .select('role')
      .eq('store_id', storeId)
      .eq('user_id', user.id)
      .single()

    if (memberErr && memberErr.code !== 'PGRST116') {
      console.error('[push/subscribe] 店舗メンバー確認失敗:', memberErr)
      return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 })
    }
    if (!membership) {
      return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
    }
  } else if (orderId) {
    // ユーザー購読（ゲスト可）：orderId が実在するか確認（IDOR 対策）
    // 注文の存在チェックのみ行い、内容は返さない
    const { data: orderExists, error: orderErr } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .single()

    if (orderErr && orderErr.code !== 'PGRST116') {
      console.error('[push/subscribe] 注文確認失敗:', orderErr)
      return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 })
    }
    if (!orderExists) {
      // 存在しない orderId には 404 ではなく 400 を返す（情報漏洩防止）
      return NextResponse.json({ error: '注文情報が不正です。' }, { status: 400 })
    }
  }

  // UPSERT: (endpoint, order_id) または (endpoint, store_id) の複合ユニーク制約でコンフリクト解決
  const conflictTarget = orderId
    ? 'endpoint, order_id'
    : 'endpoint, store_id'

  const { error: upsertErr } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        order_id: orderId ?? null,
        store_id: storeId ?? null,
      },
      { onConflict: conflictTarget }
    )

  if (upsertErr) {
    console.error('[push/subscribe] UPSERT 失敗:', upsertErr)
    return NextResponse.json({ error: '登録に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE: 購読解除
// body: { endpoint: string }
export async function DELETE(request: NextRequest) {
  let body: { endpoint: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint が必要です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)

  if (error) {
    console.error('[push/subscribe] DELETE 失敗:', error)
    return NextResponse.json({ error: '解除に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
