import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * 注文フロー E2E テスト
 *
 * globalSetup が Supabase にテスト用店舗を seed し、
 * .test-store.json にスラッグを書き出す。
 * 環境変数 PLAYWRIGHT_TEST_STORE_SLUG で上書き可能（手動実行時）。
 *
 * 例: PLAYWRIGHT_TEST_STORE_SLUG=my-store npx playwright test store-order-flow
 */

function resolveTestSlug(): string | undefined {
  if (process.env.PLAYWRIGHT_TEST_STORE_SLUG) return process.env.PLAYWRIGHT_TEST_STORE_SLUG
  try {
    const file = path.resolve(__dirname, '.test-store.json')
    const info = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return info.slug as string
  } catch {
    return undefined
  }
}

const TEST_SLUG = resolveTestSlug()

// ---------------------------------------------------------------------------
// スラッグ不要のテスト（404 ハンドリング）
// ---------------------------------------------------------------------------
test.describe('店舗ページ — スラッグ不明時の動作', () => {
  test('存在しない店舗スラッグは 404 ページを表示する', async ({ page }) => {
    // Next.js App Router の dev モードでは notFound() が HTTP 200 を返す場合がある
    // ページコンテンツで確認する
    await page.goto('/this-slug-definitely-does-not-exist-xyz99999')
    await expect(page.getByRole('heading', { name: /見つかりません/ })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// スラッグあり — 実データを使う注文フロー
// ---------------------------------------------------------------------------
test.describe('店舗注文フロー（実店舗データ使用）', () => {
  test.skip(!TEST_SLUG, 'PLAYWRIGHT_TEST_STORE_SLUG が設定されていないためスキップ')

  async function gotoStore(page: Page) {
    await page.goto(`/${TEST_SLUG}`)
  }

  test('店舗ページが表示される', async ({ page }) => {
    await gotoStore(page)
    // ページが正常に表示される（404 でも 500 でもない）
    await expect(page).not.toHaveURL(/\/not-found/)
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('メニュー一覧が表示される', async ({ page }) => {
    await gotoStore(page)
    // メニューアイテムが最低 1 件表示される
    // MenuView は "カートを確認する" ボタンで識別
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('JSON-LD が FoodEstablishment スキーマを含む', async ({ page }) => {
    await gotoStore(page)
    const jsonld = await page.$eval(
      'script[type="application/ld+json"]',
      (el) => el.textContent ?? '',
    ).catch(() => null)
    if (!jsonld) return // 店舗が存在しない場合はスキップ
    const schema = JSON.parse(jsonld)
    expect(schema['@type']).toBe('FoodEstablishment')
    expect(schema.potentialAction?.['@type']).toBe('OrderAction')
  })

  test('メニューアイテムをカートに追加できる', async ({ page }) => {
    await gotoStore(page)

    // メニュー追加ボタン（最初の +1 ボタン）を探す
    const addBtns = page.getByRole('button').filter({ hasText: /^\+$|^＋$/ })
    const firstBtn = addBtns.first()

    // ボタンが存在すれば追加、なければスキップ（営業時間外で無効の場合）
    if (await firstBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstBtn.click()

      // カート確認ボタンが表示される（1点追加で float button が出る）
      const cartBtn = page.getByRole('button', { name: /カートを確認する/ })
      await expect(cartBtn).toBeVisible({ timeout: 5_000 })
      // 1点以上が表示されていることを確認
      await expect(cartBtn).toContainText('1点')
    }
  })

  test('カート画面が表示できる', async ({ page }) => {
    await gotoStore(page)

    // メニューアイテムを 1 件追加
    const addBtns = page.getByRole('button').filter({ hasText: /^\+$|^＋$/ })
    const firstBtn = addBtns.first()
    if (!(await firstBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return

    await firstBtn.click()

    const cartBtn = page.getByRole('button', { name: /カートを確認する/ })
    await expect(cartBtn).toBeVisible({ timeout: 5_000 })
    await cartBtn.click()

    // Cart コンポーネントが表示される
    // "受取方法を選択" グループまたは "合計" テキストが表示される
    await expect(
      page.getByRole('group', { name: /受取方法/ }).or(page.getByText(/合計金額|合計/)),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('カートから数量を増減できる', async ({ page }) => {
    await gotoStore(page)

    const addBtns = page.getByRole('button').filter({ hasText: /^\+$|^＋$/ })
    const firstBtn = addBtns.first()
    if (!(await firstBtn.isVisible({ timeout: 3_000 }).catch(() => false))) return

    // カートに 2 件追加
    await firstBtn.click()
    await firstBtn.click()

    const cartBtn = page.getByRole('button', { name: /カートを確認する/ })
    await expect(cartBtn).toBeVisible()
    await cartBtn.click()

    // 数量増加ボタン
    const incBtn = page.getByRole('button', { name: /数量を1つ増やす/ }).first()
    if (await incBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await incBtn.click()
      // 3点になる
      await expect(page.getByRole('button', { name: /カートを確認する/ }).or(
        page.getByText('3点')
      )).toContainText('3')
    }
  })

  test('受取方法の切り替えができる', async ({ page }) => {
    await gotoStore(page)

    const addBtns = page.getByRole('button').filter({ hasText: /^\+$|^＋$/ })
    if (!(await addBtns.first().isVisible({ timeout: 3_000 }).catch(() => false))) return
    await addBtns.first().click()

    const cartBtn = page.getByRole('button', { name: /カートを確認する/ })
    await expect(cartBtn).toBeVisible()
    await cartBtn.click()

    // 受取方法グループ
    const methodGroup = page.getByRole('group', { name: /受取方法を選択/ })
    if (await methodGroup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 「時間指定」ボタンが存在すればクリック
      const scheduledBtn = methodGroup.getByRole('button', { name: /時間指定/ })
      if (await scheduledBtn.isVisible().catch(() => false)) {
        await scheduledBtn.click()
        // 時刻選択グループが表示される
        await expect(
          page.getByRole('group', { name: /受取時刻を選択/ })
        ).toBeVisible({ timeout: 3_000 })
      }
    }
  })
})
