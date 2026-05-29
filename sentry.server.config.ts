// Sentry server-side init.
// instrumentation.ts から Node.js runtime のときに動的 import される。
//
// SENTRY_DSN が未設定なら init を skip → 完全 no-op。
// 既存環境 (DSN 未登録) では一切挙動が変わらない。

import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // パフォーマンス計測は 10% sample (本番トラフィック予測に基づく、後で調整可)
    tracesSampleRate: 0.1,
    // breadcrumbs / event の PII を落とす
    beforeSend(event) {
      // request 由来の PII を削除
      if (event.request) {
        // cookies は session 情報を含むので drop
        if (event.request.cookies) delete event.request.cookies
        // Authorization / cookie ヘッダを drop
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>
          delete h['cookie']
          delete h['authorization']
          delete h['x-supabase-auth']
        }
        // body は注文情報 / 個人情報を含む可能性 → drop
        if (event.request.data) delete event.request.data
      }
      // user.email 等を drop (anonymous user の uuid のみ残す)
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
        delete event.user.username
      }
      return event
    },
    // breadcrumb の data からも PII を削る
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) {
        const d = breadcrumb.data as Record<string, unknown>
        // 注文 / 顧客識別子は残すが、決済 / カード / メール等は drop
        delete d.email
        delete d.card
        delete d.cookie
        delete d.authorization
      }
      return breadcrumb
    },
    // environment は Vercel が自動で渡す VERCEL_ENV に揃える
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  })
}
