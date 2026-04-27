// テスト環境共通セットアップ — 必須環境変数のダミー値
// lib/env.ts は全変数の存在を起動時に検証するため、テストでも揃えておく必要がある
const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL:      'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY:     'test-service-key',
  SESSION_SECRET:                'test-secret-for-vitest-only',
  ADMIN_EMAIL:                   'admin@test.local',
  ADMIN_PASSWORD:                'test-password',
  ADMIN_STORE_ID:                '00000000-0000-0000-0000-000000000000',
  STRIPE_SECRET_KEY:             'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET:         'whsec_test_dummy',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:  'test-vapid-public',
  VAPID_PRIVATE_KEY:             'test-vapid-private',
  VAPID_SUBJECT:                 'mailto:test@test.local',
}

for (const [k, v] of Object.entries(TEST_ENV)) {
  process.env[k] ??= v
}
