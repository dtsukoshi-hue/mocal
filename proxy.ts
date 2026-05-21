import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// Content Security Policy (CSP) — nonce ベースで XSS を防御
// Next.js App Router は hydration 用インラインスクリプトを注入するため、
// nonce を使って特定スクリプトだけを許可する。
// ---------------------------------------------------------------------------
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'

  // Supabase WebSocket URL（env から動的に取得）
  let supabaseHost = ''
  let supabaseWss = ''
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (supabaseUrl) {
      supabaseHost = new URL(supabaseUrl).host
      supabaseWss  = `wss://${supabaseHost}`
    }
  } catch { /* invalid URL → fallback to empty */ }

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic': nonce 付きスクリプトが動的に読み込むスクリプトも許可
    // js.stripe.com: Stripe.js（支払いフォーム）
    // 'unsafe-eval': 開発環境のみ（React DevTools が使用）
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com${isDev ? " 'unsafe-eval'" : ''}`,
    // Stripe の Payment Element はインラインスタイルを注入するため unsafe-inline が必要
    `style-src 'self' 'unsafe-inline'`,
    // Stripe のカードロゴ等の画像 + Supabase Storage（店舗・メニュー画像）
    `img-src 'self' blob: data: https://*.stripe.com${supabaseHost ? ` https://${supabaseHost}` : ''}`,
    `font-src 'self'`,
    `media-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Stripe Payment Element は iframe で描画される（hooks.stripe.com: 3DS 認証フレーム）
    `frame-src https://js.stripe.com https://hooks.stripe.com`,
    // Supabase REST/Realtime（HTTP + WebSocket）+ Stripe API（r/m はテレメトリ）
    `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} ${supabaseWss}` : ''} https://api.stripe.com https://r.stripe.com https://m.stripe.com`,
    // Service Worker（WebPush 通知）
    `worker-src 'self'`,
    `frame-ancestors 'none'`,
  ]

  return directives.join('; ')
}

// ---------------------------------------------------------------------------
// シンプルなインメモリ Rate Limiter
// ※ Vercel Serverless は複数インスタンスで動くため完全な制限にはならない。
//    本番環境では Upstash Redis 等を使用すること。
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMITS: { path: string; max: number; windowMs: number }[] = [
  // PATCH /api/orders/[id] — 店舗スタッフの注文状態更新: 60回/分/IP
  { path: '/api/orders/', max: 60, windowMs: 60_000 },
  // 注文作成は Server Action 経由のため /api/orders への直接 POST は存在しない
  { path: '/api/push/subscribe', max: 20, windowMs: 60_000 },
  // テスト通知: 5回/分/IP（スパム防止）
  { path: '/api/push/test', max: 5, windowMs: 60_000 },
  // 画像アップロード: 10回/分/IP（5MB×10=50MB/分上限）
  { path: '/api/admin/store/image', max: 10, windowMs: 60_000 },
  { path: '/api/admin/menu/image', max: 10, windowMs: 60_000 },
  // CSV エクスポート: 10回/時/IP（重い DB クエリのため）
  { path: '/api/admin/reports/export', max: 10, windowMs: 3_600_000 },
]

function checkRateLimit(ip: string, pathname: string): boolean {
  const rule = RATE_LIMITS.find(r => pathname.startsWith(r.path))
  if (!rule) return true

  const key = `${ip}:${rule.path}`
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    // Purge expired entries periodically to prevent unbounded growth
    if (rateLimitMap.size > 5000) {
      for (const [k, v] of rateLimitMap) {
        if (now > v.resetAt) rateLimitMap.delete(k)
      }
    }
    rateLimitMap.set(key, { count: 1, resetAt: now + rule.windowMs })
    return true
  }

  if (entry.count >= rule.max) return false
  entry.count++
  return true
}

// /admin/* を保護する（楽観的チェックのみ・DAL で二重検証）
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // Rate Limit チェック（API エンドポイント）
  if (pathname.startsWith('/api/') && !checkRateLimit(ip, pathname)) {
    return NextResponse.json(
      { error: 'リクエストが多すぎます。しばらく経ってから再試行してください。' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  // CSP 用 nonce を生成（ページリクエストのみ）
  // _next/static・API・favicon など静的リソースは除外
  const isPageRequest = !pathname.startsWith('/_next/') && !pathname.startsWith('/api/')
  const nonce = isPageRequest
    ? Buffer.from(crypto.randomUUID()).toString('base64')
    : null
  const csp = nonce ? buildCsp(nonce) : null

  // nonce を request headers に付与（Server Components が headers() で読めるようにする）。
  // Content-Security-Policy は response 専用 (CSP は request header に意味を持たない)
  // ため、ここでは設定しない (F-13 修正)。
  const requestHeaders = new Headers(request.headers)
  if (nonce) {
    requestHeaders.set('x-nonce', nonce)
  }

  // 認証不要の管理画面ページはスキップ
  if (pathname === '/admin/login' || pathname === '/admin/reset-password') {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (csp) response.headers.set('Content-Security-Policy', csp)
    return response
  }

  // /admin/* へのアクセスはセッション確認
  if (pathname.startsWith('/admin')) {
    let response = NextResponse.next({ request: { headers: requestHeaders } })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            // request.cookies.set が request.headers の Cookie も更新するため、
            // 最新の request.headers から再取得して nonce を付与し直す
            // (Content-Security-Policy は response 専用なので request に設定しない / F-13)
            const updatedHeaders = new Headers(request.headers)
            if (nonce) {
              updatedHeaders.set('x-nonce', nonce)
            }
            response = NextResponse.next({ request: { headers: updatedHeaders } })
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    if (csp) response.headers.set('Content-Security-Policy', csp)
    return response
  }

  // その他のページ（店舗ページ等）
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (csp) response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // _next/static・_next/image・favicon・Stripe webhook は除外
      // next-router-prefetch / purpose:prefetch ヘッダーを持つリクエストも除外
      // （プリフェッチには nonce 注入が不要なため）
      source: '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
