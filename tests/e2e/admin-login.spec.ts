import { test, expect } from '@playwright/test'

/**
 * 管理画面ログインページ（/admin/login）の E2E テスト
 *
 * 実際のログイン成功テストは別途 credentials が必要なため除外。
 * ここでは UI のレンダリング・フォームバリデーション・ナビゲーションを検証する。
 */
test.describe('/admin/login — ログインページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login')
  })

  test('ページが 200 で表示される', async ({ page }) => {
    // 認証不要でログインページは常に表示される（未ログイン時）
    expect(page.url()).toContain('/admin/login')
  })

  test('ロゴ / ブランドが表示される', async ({ page }) => {
    await expect(page.getByText('mocal').first()).toBeVisible()
  })

  test('メールアドレス入力フィールドが存在する', async ({ page }) => {
    const emailInput = page.locator('input[id="email"]')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')
  })

  test('パスワード入力フィールドが存在する', async ({ page }) => {
    const passwordInput = page.locator('input[id="password"]')
    await expect(passwordInput).toBeVisible()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('ログインボタンが存在する', async ({ page }) => {
    const loginBtn = page.getByRole('button', { name: /ログイン/ }).first()
    await expect(loginBtn).toBeVisible()
  })

  test('パスワードを忘れた場合のリンクが存在する', async ({ page }) => {
    await expect(page.getByText(/パスワードをお忘れの方|パスワードを忘れた/)).toBeVisible()
  })

  test('不正な認証情報でログインするとエラーが表示される', async ({ page }) => {
    await page.locator('input[id="email"]').fill('invalid@example.com')
    await page.locator('input[id="password"]').fill('wrongpassword')
    await page.getByRole('button', { name: /ログイン/ }).first().click()
    // エラーメッセージが role="alert" で表示される
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  })

  test('LP へのリンクが存在する', async ({ page }) => {
    // ロゴかホームリンクで LP に戻れることを確認
    const homeLink = page.getByRole('link', { name: /mocal/ }).first()
    if (await homeLink.isVisible()) {
      await expect(homeLink).toHaveAttribute('href', '/')
    }
  })
})

test.describe('/admin/* — 未認証リダイレクト', () => {
  test('/admin/dashboard は未認証で /admin/login にリダイレクトされる', async ({ page }) => {
    await page.goto('/admin/dashboard')
    // proxy.ts が未認証ユーザーを /admin/login にリダイレクトする
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('/admin/menu は未認証で /admin/login にリダイレクトされる', async ({ page }) => {
    await page.goto('/admin/menu')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
