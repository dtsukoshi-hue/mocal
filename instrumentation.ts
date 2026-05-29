// Next.js 16 instrumentation hook.
// Server (Node.js runtime) と Edge runtime のそれぞれで Sentry を初期化する。
// Client 側は Next.js が sentry.client.config.ts を自動 bundle する。
//
// SENTRY_DSN が未設定の場合、各 config 側で init を skip → 完全 no-op。

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Server Component / Server Action 等で発生した unhandled error を Sentry に転送するための hook。
// Next.js 16 公式の onRequestError ライフサイクル。
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: 'Pages Router' | 'App Router'; routePath: string; routeType: 'render' | 'route' | 'action' | 'middleware' }
) {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(error, request, context)
}
