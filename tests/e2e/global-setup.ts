import { chromium } from '@playwright/test'

/**
 * グローバルセットアップ — 全ページをウォームアップ
 *
 * Next.js dev server はリクエスト時にオンデマンドでコンパイルする。
 * 初回リクエストは 30〜60 秒かかる場合があるため、
 * テスト本体が始まる前に全ページをプリロードしておく。
 */
export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const baseURL = 'http://localhost:3000'
  const pages = ['/', '/for-stores', '/privacy', '/tokushoho', '/admin/login']

  console.log('\n[global-setup] Warming up pages...')
  for (const path of pages) {
    try {
      await page.goto(`${baseURL}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      })
      console.log(`  ✓ ${path}`)
    } catch (e) {
      console.warn(`  ! ${path} warmup failed (continuing):`, (e as Error).message)
    }
  }

  await browser.close()
  console.log('[global-setup] Done.\n')
}
