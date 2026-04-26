import 'server-only'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-server'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToStore(
  storeId: string,
  payload: { title: string; body: string; url?: string }
) {
  const supabase = createServiceClient()
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('store_id', storeId)

  if (!subscriptions || subscriptions.length === 0) return

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      )
    )
  )

  // 410 Gone（無効なサブスクリプション）を削除
  const expiredEndpoints: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410) {
        expiredEndpoints.push(subscriptions[i].endpoint)
      }
    }
  })

  if (expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints)
  }
}
