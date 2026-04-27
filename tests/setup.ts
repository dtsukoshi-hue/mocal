// テスト環境共通セットアップ
// session.ts は SESSION_SECRET を要求するので固定値を入れる
process.env.SESSION_SECRET ??= 'test-secret-for-vitest-only-not-real'
