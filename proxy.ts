import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

// /admin/* を保護する（楽観的チェックのみ・DAL で二重検証）
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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
