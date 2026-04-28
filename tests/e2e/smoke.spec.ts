import { test, expect } from '@playwright/test'

// アプリの基本的な疎通確認（DB / Stripe に依存しない範囲）
// 本格的な購入フローは別途 staging 環境向けに用意する。

test.describe('smoke', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.ts).toBeTruthy()
  })

  test('robots.txt blocks /admin/ and /api/', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('Disallow: /admin/')
    expect(body).toContain('Disallow: /api/')
  })

  test('manifest.webmanifest is served', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('mocal')
  })

  test('admin login page renders without auth', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.getByText('mocal')).toBeVisible()
    await expect(page.getByLabel('メールアドレス')).toBeVisible()
    await expect(page.getByLabel('パスワード')).toBeVisible()
    await expect(page.getByRole('button', { name: /ログイン/ })).toBeVisible()
  })

  test('unauthenticated /admin/dashboard redirects to login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('orders history page renders empty state', async ({ page }) => {
    await page.goto('/orders')
    // ローカルストレージに何も無ければ「保存された注文はありません」
    await expect(page.getByText(/保存された注文はありません/)).toBeVisible()
  })

  test('not-found page renders for invalid route', async ({ page }) => {
    const res = await page.goto('/nonexistent-path-xyz')
    expect(res?.status()).toBe(404)
    await expect(page.getByText(/ページが見つかりません/)).toBeVisible()
  })

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/admin/login')
    const headers = res.headers()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['referrer-policy']).toBeTruthy()
  })
})
