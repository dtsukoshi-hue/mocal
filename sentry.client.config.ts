// Sentry client (browser) init.
// Next.js は build 時にこのファイルを自動的に検出してバンドルする。
//
// NEXT_PUBLIC_SENTRY_DSN が未設定なら init を skip → 完全 no-op。
// ※ 公開 DSN は client に出るため `NEXT_PUBLIC_` prefix が必須。

import * as Sentry from '@sentry/nextjs'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // ブラウザ側 trace は基本 OFF (パフォーマンス計測は将来 #15 完了後に検討)
    tracesSampleRate: 0,
    // Replay は導入コスト大 (sample 録画+plan 別料金) なので未使用
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // client 側でも PII を落とす
    beforeSend(event) {
      if (event.request) {
        if (event.request.cookies) delete event.request.cookies
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>
          delete h['cookie']
          delete h['authorization']
        }
        if (event.request.data) delete event.request.data
      }
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
        delete event.user.username
      }
      return event
    },
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  })
}
