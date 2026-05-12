import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

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
    // Stripe のカードロゴ等の画像 + Supabase Storage（店舗ロゴ・メニュー画像）
    `img-src 'self' blob: data: https://*.stripe.com${supabaseHost ? ` https://${supabaseHost}` : ''}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Stripe Payment Element は iframe で描画される
    `frame-src https://js.stripe.com`,
    // Supabase REST/Realtime（HTTP + WebSocket）+ Stripe API
    `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} ${supabaseWss}` : ''} https://api.stripe.com`,
    // Service Worker（WebPush 通知）
    `worker-src 'self'`,
    `frame-ancestors 'none'`,
  ]

  return directives.join('; ')
}

// Edge Runtime rate limiter (in-memory, per-instance)
const edgeRateLimitStore = new Map<string, { count: number; resetAt: number }>()
const PRUNE_THRESHOLD = 500

// 期限切れエントリを削除してメモリ肥大化を防ぐ（サイズが閾値を超えたときのみ実行）
function pruneEdgeRateLimitStore(now: number) {
  if (edgeRateLimitStore.size < PRUNE_THRESHOLD) return
  for (const [key, record] of edgeRateLimitStore) {
    if (record.resetAt < now) edgeRateLimitStore.delete(key)
  }
}

function edgeCheckRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  pruneEdgeRateLimitStore(now)
  const record = edgeRateLimitStore.get(key)
  if (!record || record.resetAt < now) {
    edgeRateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  record.count++
  return record.count <= max
}

function rateLimitedResponse() {
  return new NextResponse(
    JSON.stringify({ error: 'リクエストが多すぎます。しばらく待ってから再試行してください。' }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }
  )
}

// /admin/* を保護する（楽観的チェックのみ・DAL で二重検証）
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  // Rate limiting: POST /api/auth/login → max 5 per minute per IP
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    if (!edgeCheckRateLimit(`login:${ip}`, 5, 60_000)) {
      return rateLimitedResponse()
    }
  }

  // Rate limiting: PATCH /api/orders/* → max 30 per minute per IP
  if (pathname.startsWith('/api/orders/') && request.method === 'PATCH') {
    if (!edgeCheckRateLimit(`orders:${ip}`, 30, 60_000)) {
      return rateLimitedResponse()
    }
  }

  // CSP 用 nonce を生成（ページリクエストのみ）
  // _next/static・API・favicon など静的リソースは除外
  const isPageRequest = !pathname.startsWith('/_next/') && !pathname.startsWith('/api/')
  const nonce = isPageRequest
    ? Buffer.from(crypto.randomUUID()).toString('base64')
    : null
  const csp = nonce ? buildCsp(nonce) : null

  // nonce を request headers にも付与（Server Components が headers() で読めるようにする）
  const requestHeaders = new Headers(request.headers)
  if (nonce && csp) {
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
  }

  // ログインページはスキップ
  if (pathname === '/admin/login') {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (csp) response.headers.set('Content-Security-Policy', csp)
    return response
  }

  // /admin/* へのアクセスはセッション確認
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_session')?.value
    if (!token || !verifySessionToken(token)) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (csp) response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
  ],
}
