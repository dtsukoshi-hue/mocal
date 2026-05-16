import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { TEST_STORE_FILE } from './global-setup'

/**
 * グローバルティアダウン — テスト用店舗を Supabase から削除する
 */
export default async function globalTeardown() {
  if (!fs.existsSync(TEST_STORE_FILE)) return

  let storeId: string | undefined
  try {
    const info = JSON.parse(fs.readFileSync(TEST_STORE_FILE, 'utf-8'))
    storeId = info.id
  } catch {
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey || !storeId) return

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // FK 制約順に削除
    await supabase.from('menu_items').delete().eq('store_id', storeId)
    await supabase.from('push_subscriptions').delete().eq('store_id', storeId)
    await supabase.from('stores').delete().eq('id', storeId)

    console.log('[global-teardown] テスト店舗を削除しました')
  } catch (err) {
    console.warn('[global-teardown] クリーンアップ中にエラー:', err)
  } finally {
    try { fs.unlinkSync(TEST_STORE_FILE) } catch { /* 無視 */ }
  }
}
