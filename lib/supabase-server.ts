import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getEnv } from './env'
import type { Database } from './database.types'

// service_role キーを使用（RLS バイパス）
// Webhook 処理・サーバー自動処理のみで使用すること
export function createServiceClient() {
  return createClient<Database>(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// anon キーを使用し、リクエストの Cookie からセッションを読み取る
// ゲストの匿名認証ユーザー ID を取得するために使用
export async function createCookieClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components / Server Actions では書き込みが制限される場合がある
          }
        },
      },
    }
  )
}
