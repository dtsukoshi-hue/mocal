import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

// Edge Runtime rate limiter (in-memory, per-instance)
const edgeRateLimitStore = new Map<string, { count: number; resetAt: number }>()

function edgeCheckRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
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

  // ログインページはスキップ
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  // /admin/* へのアクセスはセッション確認
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_session')?.value
    if (!token || !verifySessionToken(token)) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
  ],
}
