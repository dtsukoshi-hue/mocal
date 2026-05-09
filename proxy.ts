import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// シンプルなインメモリ Rate Limiter
// ※ Vercel Serverless は複数インスタンスで動くため完全な制限にはならない。
//    本番環境では Upstash Redis 等を使用すること。
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMITS: { path: string; max: number; windowMs: number }[] = [
  // PATCH /api/orders/[id] — 店舗スタッフの注文状態更新: 60回/分/IP（より寛大に）
  // ※ /api/orders/ (スラッシュあり) を先に置いて find の優先度を利用する
  { path: '/api/orders/', max: 60, windowMs: 60_000 },
  // POST /api/orders — 顧客の注文作成: 10回/分/IP（厳しめ）
  { path: '/api/orders',  max: 10, windowMs: 60_000 },
  { path: '/api/push/subscribe', max: 20, windowMs: 60_000 },
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

  // 認証不要の管理画面ページはスキップ
  if (pathname === '/admin/login' || pathname === '/admin/reset-password') {
    return NextResponse.next()
  }

  // /admin/* へのアクセスはセッション確認
  if (pathname.startsWith('/admin')) {
    let response = NextResponse.next({ request })

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
            response = NextResponse.next({ request })
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

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
  ],
}
