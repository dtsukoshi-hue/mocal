// テスト環境共通セットアップ — 必須環境変数のダミー値
//
// `.env.local` はここでは load しない（unit test は dummy env を期待しているため）。
// 実 Supabase を必要とする security regression test 等は、
// テストファイル内で個別に `.env.local` を読み込む（process.env 汚染なし）。

const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL:           'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:      'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY:          'test-service-key',
  // 16+ chars: lib/oauth-state.ts の getSecret() が >=16 を要求
  SESSION_SECRET:                     'test-session-secret-for-vitest-32chars',
  STRIPE_SECRET_KEY:                  'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET:              'whsec_test_dummy',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:       'test-vapid-public',
  VAPID_PRIVATE_KEY:                  'test-vapid-private',
  VAPID_SUBJECT:                      'mailto:test@test.local',
  NEXT_PUBLIC_APP_URL:                'http://localhost:3000',
}

for (const [k, v] of Object.entries(TEST_ENV)) {
  process.env[k] ??= v
}
