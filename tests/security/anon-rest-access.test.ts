/**
 * Security regression test — anon role の REST アクセス境界
 *
 * F-18 (#25) の修正後に「再発を構造的に検出する」ための test。
 * docs/security-review-2026-05-21.md の F-18 を参照。
 *
 * 設計上の注意:
 *  - `.env.local` を**テストファイル内で直接読む**（process.env を汚染しない）
 *    → unit test の dummy env と分離、副作用なし
 *  - 実 Supabase に向いているときのみ実行（CI ダミー env なら skip）
 *
 * 実行:
 *  npm test                # default で走る
 *  npm run test:security   # security のみ
 *
 * 期待:
 *  - すべて PASS（F-18 修正完了済み）
 *  - 1 件でも FAIL したら **RLS の regression** を意味する。
 *    docs/security-review-2026-05-21.md F-18 と
 *    docs/rls-review-checklist.md を参照して修復すること。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// .env.local を直接パース（process.env は触らない）
function readDotenvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf-8')
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const dotenv = readDotenvLocal()
const SUPABASE_URL = dotenv.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY = dotenv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// 実行ガード:
//  - 実 Supabase（test ダミーではない）に向いている場合のみ実行
//  - CI 等で .env.local が無い環境では skip（dummy env のため）
//
// F-18 修正完了 (2026-05-21) によりガード `RUN_SECURITY_TESTS` を撤廃。
// default の `npm test` / pre-push でも常時走る = 恒久的な regression net。
const isRealSupabase =
  SUPABASE_URL.includes('.supabase.co') &&
  !SUPABASE_URL.includes('test.supabase.co') &&
  (ANON_KEY.startsWith('sb_publishable_') || ANON_KEY.startsWith('eyJ'))

async function fetchAnon(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'GET',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  })
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

describe.skipIf(!isRealSupabase)('Security: anon REST access boundaries', () => {
  describe('🔒 顧客データ（anon は SELECT 不可）', () => {
    it('anon cannot SELECT orders (F-18)', async () => {
      const { status, body } = await fetchAnon('/orders?select=id&limit=10')
      // 期待: 200 で空配列、または 401/403
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT orders even with specific id filter (F-18)', async () => {
      // 既存注文の UUID で試す（推測攻撃対策の検証）
      // 任意の UUID 形式
      const { status, body } = await fetchAnon(
        '/orders?id=eq.00000000-0000-0000-0000-000000000001&select=id',
      )
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT order_items (F-18)', async () => {
      const { status, body } = await fetchAnon('/order_items?select=id&limit=10')
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT processed_webhook_events', async () => {
      const { status, body } = await fetchAnon('/processed_webhook_events?select=stripe_event_id&limit=10')
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT push_subscriptions', async () => {
      const { status, body } = await fetchAnon('/push_subscriptions?select=endpoint&limit=10')
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT store_members (内部権限情報)', async () => {
      const { status, body } = await fetchAnon('/store_members?select=user_id,role&limit=10')
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })

    it('anon cannot SELECT profiles', async () => {
      const { status, body } = await fetchAnon('/profiles?select=id&limit=10')
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true)
        expect((body as unknown[]).length).toBe(0)
      } else {
        expect([401, 403]).toContain(status)
      }
    })
  })

  describe('🌐 公開データ（anon SELECT 可・店舗発見ページで使用）', () => {
    it('anon CAN SELECT stores (店舗発見ページの公開フィールド)', async () => {
      const { status, body } = await fetchAnon('/stores?select=id,name,slug&limit=5')
      expect(status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
    })

    it('anon CAN SELECT menu_items (公開メニュー)', async () => {
      const { status, body } = await fetchAnon('/menu_items?select=id,name,price&limit=5')
      expect(status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
    })

    it('anon CAN SELECT store_hours (公開営業時間)', async () => {
      const { status, body } = await fetchAnon('/store_hours?select=weekday,open_time&limit=5')
      expect(status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
    })

    it('anon CAN SELECT combo_offers (公開コンボ)', async () => {
      const { status, body } = await fetchAnon('/combo_offers?select=id,name&limit=5')
      expect(status).toBe(200)
      expect(Array.isArray(body)).toBe(true)
    })
  })

  // 補足: anon INSERT のテストは実データを生成してしまうため、
  // ここでは敢えて含めない。orders_guest_insert / order_items_guest_insert の
  // policy は staging 環境または専用 fixture で検証する（#33 候補）。
})
