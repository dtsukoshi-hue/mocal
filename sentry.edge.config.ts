// Sentry edge runtime init (proxy.ts 等の middleware で動く)。
// instrumentation.ts から Edge runtime のときに動的 import される。
//
// SENTRY_DSN が未設定なら init を skip。

import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    // edge runtime では request 情報の PII を server config と同様に sanitize
    beforeSend(event) {
      if (event.request) {
        if (event.request.cookies) delete event.request.cookies
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>
          delete h['cookie']
          delete h['authorization']
          delete h['x-supabase-auth']
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
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  })
}
