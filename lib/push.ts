import 'server-only'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-server'
import { getEnv } from './env'

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
  table: 'push_subscriptions' | 'order_push_subscriptions',
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload
) {
  if (subs.length === 0) return

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
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
    await supabase.from(table).delete().in('endpoint', expiredEndpoints)
  }
}

export async function sendPushToStore(storeId: string, payload: PushPayload) {
  initVapid()
  const supabase = createServiceClient()
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('store_id', storeId)
  await sendBatch('push_subscriptions', subscriptions ?? [], payload)
}

/** 注文 ID に紐づく顧客サブスクリプションへ通知 */
export async function sendPushToOrder(orderId: string, payload: PushPayload) {
  initVapid()
  const supabase = createServiceClient()
  const { data: subscriptions } = await supabase
    .from('order_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('order_id', orderId)
  await sendBatch('order_push_subscriptions', subscriptions ?? [], payload)
}
