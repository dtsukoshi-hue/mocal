import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

// .env.local を読み込む（SUPABASE_SERVICE_ROLE_KEY など）
config({ path: path.resolve(__dirname, '.env.local') })

/**
 * E2E テスト設定
 *
 * 実行前に Next.js dev server が起動していることを前提とする。
 * `npm run dev` を別ターミナルで起動してから `npm run test:e2e` を実行。
 *
 * CI 環境では webServer ブロックが自動的にサーバーを起動・停止する。
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* グローバルセットアップ・ティアダウン（テスト用店舗の seed / cleanup） */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  /* 並列実行 — CI では 1 ワーカーに制限 */
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,

  /* 再試行 — CI のみ 2 回 */
  retries: process.env.CI ? 2 : 0,

  /* タイムアウト — dev server の初回コンパイル（Turbopack）に余裕を持たせる */
  timeout: 120_000,
  expect: { timeout: 10_000 },

  /* レポーター */
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    /* ナビゲーションタイムアウト
     * dev server の初回コンパイルに 30〜60 秒かかる場合がある。
     * 本番環境（CI）では next build 済みのため高速。 */
    navigationTimeout: 90_000,
    /* 失敗時のスクリーンショット */
    screenshot: 'only-on-failure',
    /* ビデオ録画 — CI のみ */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    /* トレース */
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],

  /* dev server の自動起動（CI のみ。ローカルは手動で `npm run dev`） */
  webServer: process.env.CI
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
})
