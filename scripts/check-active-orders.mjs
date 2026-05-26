#!/usr/bin/env node
/**
 * 本番 (or .env.local が指す環境) に **active な注文** (= スタッフ介入待ち)
 * が残っていないかを確認する。
 *
 * deploy-runbook.md §2 「Pre-deploy: 本番 active 注文の確認」の自動化版。
 *
 * 用途:
 *  - deploy 前 / 大きな env 変更前 (例: Stripe live mode 移行) に実行
 *  - active=0 を確認してから deploy する慣習を機械的に支える
 *
 * 振る舞い:
 *  - active な注文 (pending / paid / accepted / preparing / ready) を集計
 *  - 件数とサンプル (最新 5 件) を表示
 *  - **読み取り専用**。UPDATE / DELETE は一切しない
 *  - active=0 のときは exit 0、それ以外は exit 1 (CI 連動可能)
 *
 * 使い方: `npm run db:active-orders`
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local に必要')
  process.exit(2)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// lib/validation.ts の ALL_ORDER_STATUSES から「terminal でない」もの
const ACTIVE_STATUSES = ['pending', 'paid', 'accepted', 'preparing', 'ready']

console.log(`→ 接続先: ${SUPABASE_URL}`)
console.log(`→ active 判定: ${ACTIVE_STATUSES.join(' / ')}`)
console.log('')

const { data, error, count } = await sb
  .from('orders')
  .select('id, order_number, status, store_id, created_at, total_amount', { count: 'exact' })
  .in('status', ACTIVE_STATUSES)
  .order('created_at', { ascending: false })
  .limit(5)

if (error) {
  console.error(`❌ クエリ失敗: ${error.code} ${error.message}`)
  process.exit(2)
}

const total = count ?? 0
console.log(`active 注文件数: ${total}`)

if (total === 0) {
  console.log('')
  console.log('✅ active な注文なし。deploy / env 変更を進めて安全。')
  process.exit(0)
}

console.log('')
console.log('最新サンプル (最大 5 件):')
for (const o of data ?? []) {
  console.log(
    `  - ${o.order_number}  status=${o.status}  store=${o.store_id?.slice(0, 8)}…  ¥${o.total_amount}  ${o.created_at}`
  )
}

console.log('')
console.log('⚠️  active 注文が残っています。')
console.log('   deploy 前に店舗側で処理 (受理 → 準備 → 受渡 / キャンセル) を完了させてください。')
console.log('   どうしても deploy が必要な場合は、deploy-runbook.md §2 を参照して判断してください。')
process.exit(1)
