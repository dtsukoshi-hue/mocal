import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let subscription: PushSubscriptionJSON
  try {
    subscription = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'サブスクリプション情報が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 同じendpointが既にあれば更新、なければ挿入
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        store_id: session.storeId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'endpoint' }
    )

  if (error) {
    logger.error('push subscribe upsert error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '登録に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { endpoint?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (typeof body.endpoint !== 'string' || !body.endpoint) {
    return NextResponse.json({ error: 'エンドポイントが不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('store_id', session.storeId)

  return NextResponse.json({ ok: true })
}
