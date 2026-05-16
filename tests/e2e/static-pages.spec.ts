import { test, expect } from '@playwright/test'

/**
 * 静的ページ（privacy / tokushoho / 404）の E2E テスト
 */
test.describe('/privacy — プライバシーポリシー', () => {
  test('ページが 200 で表示される', async ({ page }) => {
    const res = await page.goto('/privacy')
    expect(res?.status()).toBe(200)
  })

  test('h1 が表示される', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('ページタイトルに "プライバシー" が含まれる', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).toHaveTitle(/プライバシー/)
  })
})

test.describe('/tokushoho — 特定商取引法', () => {
  test('ページが 200 で表示される', async ({ page }) => {
    const res = await page.goto('/tokushoho')
    expect(res?.status()).toBe(200)
  })

  test('h1 が表示される', async ({ page }) => {
    await page.goto('/tokushoho')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('ページタイトルに "特定商取引" が含まれる', async ({ page }) => {
    await page.goto('/tokushoho')
    await expect(page).toHaveTitle(/特定商取引/)
  })
})

test.describe('404 ページ', () => {
  test('存在しない URL は 404 ページを表示する', async ({ page }) => {
    // Next.js App Router の dev モードでは notFound() が HTTP 200 を返す場合がある
    // ステータスコードではなくページコンテンツで確認する
    await page.goto('/this-page-does-not-exist-xyz-123')
    await expect(page.getByRole('heading', { name: /ページが見つかりません/ })).toBeVisible()
  })

  test('404 ページに "見つかりません" が表示される', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz-123')
    // title と h1 の両方にマッチするため getByRole で限定する
    await expect(page.getByRole('heading', { name: /見つかりません/ })).toBeVisible()
  })

  test('404 ページから LP へ戻れる', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz-123')
    await page.getByRole('link', { name: /トップへ戻る/ }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('共通 — セキュリティヘッダー', () => {
  test('X-Frame-Options が DENY に設定されている', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options が nosniff に設定されている', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.headers()['x-content-type-options']).toBe('nosniff')
  })

  test('CSP ヘッダーが nonce を含む', async ({ page }) => {
    const res = await page.goto('/')
    const csp = res?.headers()['content-security-policy'] ?? ''
    expect(csp).toContain("'nonce-")
    expect(csp).toContain("'strict-dynamic'")
  })
})
