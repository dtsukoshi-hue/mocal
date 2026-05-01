import { test, expect } from '@playwright/test'

// 顧客フローの E2E（実 DB を読むが書き込みはしない）
// 本番デプロイへの smoke として実行する想定

const PILOT_STORE_ID = 'ce7ad472-381b-4a7b-8ca6-3e0a46ee5656'

test.describe('customer-flow', () => {
  test('discovery page lists stores', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('mocal')).toBeVisible()
    // 店舗カードが少なくとも1件
    await expect(page.locator('a[href^="/"]').filter({ hasText: '受付' }).first()).toBeVisible()
  })

  test('discovery page has area / cuisine filters when stores have them', async ({ page }) => {
    await page.goto('/')
    // ヘッダー部分にエリアまたはジャンルチップが表示される（パイロット店舗が登録されている前提）
    const chips = page.getByRole('button', { name: /すべてのエリア|すべて/ })
    await expect(chips.first()).toBeVisible()
  })

  test('store page renders for valid store id', async ({ page }) => {
    await page.goto(`/${PILOT_STORE_ID}`)
    // 店舗名・受付状態が見える
    await expect(page.getByText(/受付中|受付停止中/)).toBeVisible()
  })

  test('invalid store id returns 404', async ({ page }) => {
    const res = await page.goto('/00000000-0000-0000-0000-000000000000')
    expect(res?.status()).toBe(404)
  })

  test('mypage renders with notification panel', async ({ page }) => {
    await page.goto('/mypage')
    await expect(page.getByText('マイページ')).toBeVisible()
    await expect(page.getByText('ゲストユーザー')).toBeVisible()
    // 通知設定セクション
    await expect(page.getByText('通知設定')).toBeVisible()
  })

  test('orders history page is reachable from bottom nav', async ({ page }) => {
    await page.goto('/')
    // ボトムナビの「注文履歴」リンク
    await page.getByRole('link', { name: /注文履歴/ }).first().click()
    await expect(page).toHaveURL(/\/orders$/)
  })

  test('mypage has tab navigation to home and history', async ({ page }) => {
    await page.goto('/mypage')
    // ボトムナビ確認
    await expect(page.getByRole('link', { name: /ホーム/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /注文履歴/ }).first()).toBeVisible()
  })
})

test.describe('admin-flow (unauthenticated)', () => {
  test('login page accepts email / password fields', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel('メールアドレス').fill('test@example.com')
    await page.getByLabel('パスワード').fill('wrongpassword')
    await page.getByRole('button', { name: /ログイン/ }).click()
    // 認証失敗のメッセージが出る（実 DB に当たらないので 401 → エラー表示）
    await expect(
      page.getByText(/正しくありません|エラー|失敗|多すぎ/)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('protected admin pages redirect to login', async ({ page }) => {
    const protectedPaths = [
      '/admin/dashboard',
      '/admin/menu',
      '/admin/history',
      '/admin/sales',
      '/admin/hours',
      '/admin/settings',
    ]
    for (const path of protectedPaths) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/admin\/login/)
    }
  })
})
