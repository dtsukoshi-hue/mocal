import { test, expect } from '@playwright/test'

/**
 * LP（トップページ）の E2E テスト
 *
 * Supabase 接続不要 — サーバー側 fetch が発生しない静的ページ
 */
test.describe('LP (/) — レンダリングと基本機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('ページタイトルに "mocal" が含まれる', async ({ page }) => {
    await expect(page).toHaveTitle(/mocal/)
  })

  test('h1 に "mocal" ブランドが表示される', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toContainText('mocal')
  })

  test('バリュープロポジション 3 件が表示される', async ({ page }) => {
    await expect(page.getByText('QR コードで即注文')).toBeVisible()
    await expect(page.getByText('待ち時間ゼロ')).toBeVisible()
    await expect(page.getByText('準備完了を通知')).toBeVisible()
  })

  test('「店舗として登録する」CTA が表示される', async ({ page }) => {
    const cta = page.getByRole('link', { name: /店舗として登録する/ })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/onboarding')
  })

  test('「すでに登録済みの方はこちら」リンクが /admin/login を指す', async ({ page }) => {
    const link = page.getByRole('link', { name: /すでに登録済みの方はこちら/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/admin/login')
  })

  test('フッターに「店舗オーナー様へ」リンクがある', async ({ page }) => {
    const link = page.getByRole('link', { name: '店舗オーナー様へ' })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/for-stores')
  })

  test('フッターにプライバシーポリシー・特定商取引法リンクがある', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'プライバシーポリシー' })).toBeVisible()
    await expect(page.getByRole('link', { name: /特定商取引法/ })).toBeVisible()
  })

  test('JSON-LD が WebSite / Organization スキーマを含む', async ({ page }) => {
    const jsonld = await page.$eval(
      'script[type="application/ld+json"]',
      (el) => el.textContent ?? '',
    )
    const schema = JSON.parse(jsonld)
    const graph: { '@type': string }[] = schema['@graph'] ?? []
    expect(graph.some((n) => n['@type'] === 'WebSite')).toBe(true)
    expect(graph.some((n) => n['@type'] === 'Organization')).toBe(true)
  })

  test('OGP meta タグが設定されている', async ({ page }) => {
    const ogTitle = await page.$eval(
      'meta[property="og:title"]',
      (el) => el.getAttribute('content'),
    )
    expect(ogTitle).toContain('mocal')
  })

  test('スキップリンクが DOM に存在する（アクセシビリティ）', async ({ page }) => {
    // skip-link は視覚的に隠れているが DOM に存在し、フォーカスで表示される
    const skip = page.getByRole('link', { name: 'メインコンテンツへスキップ' })
    await expect(skip).toBeAttached()
    await expect(skip).toHaveAttribute('href', '#main-content')
  })
})

test.describe('LP — ナビゲーション', () => {
  test('for-stores ページへ遷移できる', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '店舗オーナー様へ' }).click()
    await expect(page).toHaveURL('/for-stores')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('admin/login ページへ遷移できる', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /すでに登録済みの方はこちら/ }).click()
    // 未認証の /admin/login は proxy.ts でリダイレクトされないため直接アクセス可
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 })
  })
})
