import 'server-only'
import { createClient } from '@supabase/supabase-js'
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
