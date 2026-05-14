import 'server-only'
import webpush from 'web-push'
import { createServiceClient } from './supabase-server'

let _vapidInitialized = false

function ensureVapid() {
  if (_vapidInitialized) return
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY はクライアント側でも使用するため NEXT_PUBLIC_ プレフィックス付き
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID 環境変数が設定されていません（NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）。')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  _vapidInitialized = true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  /** 同じ tag の通知は置き換えられる。意図的にグループ化する場合のみ指定 */
  tag?: string
}

type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth_key: string
}

// 410 Gone = ブラウザが購読を取り消した → DB から削除して次回以降スキップ
async function deleteExpiredSubscription(endpoint: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

async function sendWithRetry(
  sub: webpush.PushSubscription,
  payload: string,
  maxAttempts = 3
): Promise<void> {
  ensureVapid()
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await webpush.sendNotification(sub, payload)
      return
    } catch (err: unknown) {
      const isLast = attempt === maxAttempts
      if (err && typeof err === 'object' && 'statusCode' in err) {
        const status = (err as { statusCode: number }).statusCode
        if (status === 410 || status === 404) {
          // 410 Gone / 404 = 購読無効 → DB から削除してリトライ不要
          deleteExpiredSubscription(sub.endpoint).catch(() => {})
          return
        }
      }
      if (isLast) {
        console.error('[webpush] 送信失敗（最大リトライ到達）:', err)
        break
      }
      // 指数バックオフ: 500ms → 1000ms（最大2回リトライ）
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
}

function toWebPushSub(row: PushSubscriptionRow): webpush.PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth_key },
  }
}

export async function notifyOrder(orderId: string, payload: PushPayload): Promise<void> {
  const supabase = createServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('order_id', orderId)

  if (!subs || subs.length === 0) return
  const body = JSON.stringify(payload)
  await Promise.all(subs.map(s => sendWithRetry(toWebPushSub(s as PushSubscriptionRow), body)))
}

export async function notifyStore(storeId: string, payload: PushPayload): Promise<void> {
  const supabase = createServiceClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('store_id', storeId)

  if (!subs || subs.length === 0) return
  const body = JSON.stringify(payload)
  await Promise.all(subs.map(s => sendWithRetry(toWebPushSub(s as PushSubscriptionRow), body)))
}
