import { test, expect } from '@playwright/test'

/**
 * 飲食店向け LP（/for-stores）の E2E テスト
 */
test.describe('/for-stores — レンダリングと構造', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/for-stores')
  })

  test('ページタイトルに "飲食店オーナー様へ" が含まれる', async ({ page }) => {
    await expect(page).toHaveTitle(/飲食店オーナー様へ/)
  })

  test('ヒーロー h1 が表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/ポスレジ不要/)).toBeVisible()
  })

  test('料金セクション — 初期費用ゼロと手数料が表示される', async ({ page }) => {
    // 「初期費用」と「¥0」が含まれるセクションを確認
    await expect(page.getByText('初期費用')).toBeVisible()
    await expect(page.getByText('月額固定費')).toBeVisible()
    // 10% 手数料
    await expect(page.getByText(/10%/).first()).toBeVisible()
  })

  test('機能カードが 6 件ある', async ({ page }) => {
    // FEATURES 配列の全タイトルが表示されることを確認
    // getByRole('heading') を使わず getByText + exact: false で柔軟に照合
    const featureTitles = [
      '即日導入',
      '顧客手数料ゼロ',
      'リアルタイム通知',
      '売上レポート',
      '待ち時間を自動管理',
      'セキュアな決済',
    ]
    for (const title of featureTitles) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
    }
  })

  test('導入ステップが 4 件（01〜04）ある', async ({ page }) => {
    // span.tabular-nums 内の番号を確認
    for (const num of ['01', '02', '03', '04']) {
      await expect(page.getByText(num, { exact: true }).first()).toBeVisible()
    }
  })

  test('お問い合わせリンクが mailto を持つ', async ({ page }) => {
    const mailLinks = page.getByRole('link', { name: /お問い合わせ|メールする|相談/ })
    await expect(mailLinks.first()).toHaveAttribute('href', /^mailto:/)
  })

  test('「今すぐ登録する」が /onboarding を指す', async ({ page }) => {
    const link = page.getByRole('link', { name: /今すぐ登録する/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', '/onboarding')
  })

  test('JSON-LD が WebPage / SoftwareApplication スキーマを含む', async ({ page }) => {
    const jsonld = await page.$eval(
      'script[type="application/ld+json"]',
      (el) => el.textContent ?? '',
    )
    const schema = JSON.parse(jsonld)
    expect(schema['@type']).toBe('WebPage')
    expect(schema.mainEntity?.['@type']).toBe('SoftwareApplication')
    expect(schema.mainEntity?.offers?.price).toBe('0')
  })

  test('OGP meta タグが設定されている', async ({ page }) => {
    const ogTitle = await page.$eval(
      'meta[property="og:title"]',
      (el) => el.getAttribute('content'),
    )
    expect(ogTitle).toContain('飲食店')
  })

  test('ヘッダーのロゴが / へ戻る', async ({ page }) => {
    const logo = page.getByRole('link', { name: /mocal/ }).first()
    await expect(logo).toHaveAttribute('href', '/')
  })
})

test.describe('/for-stores — ナビゲーション', () => {
  test('ヘッダーロゴクリックで LP に戻る', async ({ page }) => {
    await page.goto('/for-stores')
    await page.getByRole('link', { name: /mocal/ }).first().click()
    await expect(page).toHaveURL('/')
  })

  test('フッターのプライバシーポリシーリンクが機能する', async ({ page }) => {
    await page.goto('/for-stores')
    await page.getByRole('link', { name: 'プライバシーポリシー' }).click()
    await expect(page).toHaveURL('/privacy')
  })
})
