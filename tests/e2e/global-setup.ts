import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

/** テスト用店舗のスラッグ（固定値で冪等） */
export const E2E_TEST_STORE_SLUG = 'e2e-test-store'

/** globalSetup から test worker へスラッグを渡すための一時ファイル */
export const TEST_STORE_FILE = path.resolve(__dirname, '.test-store.json')

/**
 * グローバルセットアップ
 *
 * 1. Supabase に E2E テスト用の店舗・メニューを upsert
 * 2. スラッグを .test-store.json に書き出す（test worker は別プロセスのため）
 * 3. Next.js dev server のページをウォームアップ
 */
export default async function globalSetup() {
  // ── 1. テスト用店舗を Supabase に seed ────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      // 既存のテスト店舗を削除（冪等性確保）
      const { data: existing } = await supabase
        .from('stores')
        .select('id')
        .eq('slug', E2E_TEST_STORE_SLUG)
        .single()

      if (existing) {
        await supabase.from('menu_items').delete().eq('store_id', existing.id)
        await supabase.from('stores').delete().eq('id', existing.id)
      }

      // テスト店舗を作成
      const { data: store, error: storeErr } = await supabase
        .from('stores')
        .insert({
          name: 'E2E テスト食堂',
          slug: E2E_TEST_STORE_SLUG,
          is_open: true,
          wait_minutes: 15,
          area: '渋谷',
          cuisine_type: '定食',
          description: 'Playwright E2E テスト専用の店舗です。',
        })
        .select('id, slug')
        .single()

      if (storeErr || !store) {
        console.warn('[global-setup] テスト店舗の作成に失敗:', storeErr?.message)
      } else {
        // メニューアイテムを作成
        await supabase.from('menu_items').insert([
          {
            store_id: store.id,
            name: 'テスト定食A',
            price: 800,
            emoji: '🍱',
            category: '定食',
            is_available: true,
            sort_order: 1,
          },
          {
            store_id: store.id,
            name: 'テストバーガー',
            price: 650,
            emoji: '🍔',
            category: 'バーガー',
            is_available: true,
            sort_order: 2,
          },
          {
            store_id: store.id,
            name: 'テストドリンク',
            price: 200,
            emoji: '🥤',
            category: 'ドリンク',
            is_available: true,
            sort_order: 3,
          },
        ])

        // test worker へ渡す情報を書き出す
        fs.writeFileSync(
          TEST_STORE_FILE,
          JSON.stringify({ slug: store.slug, id: store.id }),
          'utf-8',
        )
        console.log(`[global-setup] テスト店舗を作成しました: /${store.slug}`)
      }
    } catch (err) {
      console.warn('[global-setup] Supabase seed でエラー（続行します）:', err)
    }
  } else {
    console.warn('[global-setup] SUPABASE 環境変数が未設定 — 店舗 seed をスキップ')
  }

  // ── 2. ページウォームアップ ─────────────────────────────────────────
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const baseURL = 'http://localhost:3000'
  const warmupPages = ['/', '/for-stores', '/privacy', '/tokushoho', '/admin/login']

  console.log('\n[global-setup] Warming up pages...')
  for (const urlPath of warmupPages) {
    try {
      await page.goto(`${baseURL}${urlPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      })
      console.log(`  ✓ ${urlPath}`)
    } catch (e) {
      console.warn(`  ! ${urlPath} warmup failed (continuing):`, (e as Error).message)
    }
  }

  // テスト店舗ページもウォームアップ
  if (fs.existsSync(TEST_STORE_FILE)) {
    try {
      await page.goto(`${baseURL}/${E2E_TEST_STORE_SLUG}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      })
      console.log(`  ✓ /${E2E_TEST_STORE_SLUG}`)
    } catch {
      // 続行
    }
  }

  await browser.close()
  console.log('[global-setup] Done.\n')
}
