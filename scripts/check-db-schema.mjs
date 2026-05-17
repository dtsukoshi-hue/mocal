#!/usr/bin/env node
/**
 * 実 DB の列名と lib/database.types.ts が大きく乖離していないかを軽くチェックする。
 * Supabase CLI が無くても動く。
 *
 * 使い方: `npm run db:check`
 * 失敗時 (重大な乖離を検知) は exit 1。
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// 列名を必ず一致させたいテーブル (過去事故の中心)
const CRITICAL = {
  store_hours: ['weekday', 'is_open', 'open_time', 'close_time', 'last_order'],
  push_subscriptions: ['endpoint', 'p256dh', 'auth_key', 'order_id', 'store_id'],
  stores: ['is_open', 'wait_minutes', 'manual_override_until', 'slug'],
  orders: ['order_number', 'status', 'cancelled_reason_type', 'estimated_ready_at'],
  menu_items: ['sort_order', 'category', 'is_available'],
  order_items: ['combo_id', 'combo_label'],
}

const typesContent = readFileSync('lib/database.types.ts', 'utf8')

let fail = 0
for (const [table, expected] of Object.entries(CRITICAL)) {
  const r = await sb.from(table).select('*').limit(1)
  if (r.error) {
    console.error(`❌ ${table}: クエリ失敗 (${r.error.code})`)
    fail++
    continue
  }
  const actual = r.data?.[0] ? Object.keys(r.data[0]) : null
  if (!actual) {
    // 空テーブルは insert error 経由でも検査できるが、warning に留める
    console.warn(`⚠️  ${table}: 0 rows. 列名検査スキップ。`)
    continue
  }
  const missing = expected.filter((c) => !actual.includes(c))
  if (missing.length > 0) {
    console.error(`❌ ${table}: 実 DB に欠けている期待列: ${missing.join(', ')}`)
    fail++
    continue
  }
  // types ファイルにテーブル名が登場するか
  if (!typesContent.includes(`${table}:`) && !typesContent.includes(`'${table}'`)) {
    console.warn(`⚠️  ${table}: lib/database.types.ts に登場しない (新規追加してください)`)
  } else {
    console.log(`✅ ${table}: 列名 OK`)
  }
}

if (fail > 0) {
  console.error(`\n💥 ${fail} 件の重大な DB ↔ コード乖離を検知。`)
  console.error('対応: 実 DB の列名を変えるか、コード側を実 DB に合わせるか。')
  console.error('参考: lib/database.types.ts, app/api/admin/hours/route.ts')
  process.exit(1)
}

console.log('\n🎉 DB schema と types は整合しています。')
