import 'server-only'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-server'
import { getEnv } from './env'

// worktree DB は push_subscriptions 1 テーブルで運用:
//   store_id IS NOT NULL → 店舗向け購読
//   order_id IS NOT NULL → 顧客向け（注文ステータス）購読
// カラムは auth_key（本流の auth ではない）

function initVapid() {
  webpush.setVapidDetails(
    getEnv('VAPID_SUBJECT'),
    getEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    getEnv('VAPID_PRIVATE_KEY')
  )
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

async function sendBatch(
  subs: { endpoint: string; p256dh: string; auth_key: string }[],
  payload: PushPayload
) {
  if (subs.length === 0) return

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload)
      )
    )
  )

  // 410 Gone（無効なサブスクリプション）を削除
  const expiredEndpoints: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410) expiredEndpoints.push(subs[i].endpoint)
    }
  })

  if (expiredEndpoints.length > 0) {
    const supabase = createServiceClient()
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
  }
}

export async function sendPushToStore(storeId: string, payload: PushPayload) {
  initVapid()
  const supabase = createServiceClient()
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('store_id', storeId)
  await sendBatch(subscriptions ?? [], payload)
}

/** 注文 ID に紐づく顧客サブスクリプションへ通知 */
export async function sendPushToOrder(orderId: string, payload: PushPayload) {
  initVapid()
  const supabase = createServiceClient()
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('order_id', orderId)
  await sendBatch(subscriptions ?? [], payload)
}
