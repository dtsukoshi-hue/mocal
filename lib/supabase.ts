import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase の環境変数が設定されていません。.env.local を確認してください。')
}

// ブラウザ・サーバーコンポーネント共用（anon key）
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
