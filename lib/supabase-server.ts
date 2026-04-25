import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// service_role キーを使用（RLS バイパス）
// Webhook 処理・サーバー自動処理のみで使用すること
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service_role の環境変数が設定されていません。')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
