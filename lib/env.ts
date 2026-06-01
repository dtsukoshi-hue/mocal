import 'server-only'

// 必須環境変数の起動時検証
// 各サーバーサイドモジュールで個別に `process.env.X!` を使うと、
// 未設定時にランタイムまでエラーが出ない・stack トレースから原因が読みにくい。
// このモジュールを最初にimportした時点で全部チェックする。

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  // ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_STORE_ID は Supabase Auth 移行で不要化、
  // F-06 / #12 で削除（2026-05-22）。
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  // 公開 URL（プッシュ通知のリンク先など）
  'NEXT_PUBLIC_APP_URL',
  // cron 認証用 (Bearer)。未設定だと cron endpoint が誰でも叩け、service role
  // で DB write 可能になるため REQUIRED。各 cron route も `if (!secret) return 503`
  // でガード (defense in depth)。
  'CRON_SECRET',
] as const

type RequiredVar = typeof REQUIRED_VARS[number]

let cached: Record<RequiredVar, string> | null = null

/**
 * 必須環境変数を取得（未設定なら明確なエラーを throw）。
 * 一度成功すればキャッシュされ再検証コストはかからない。
 */
export function requireEnv(): Record<RequiredVar, string> {
  if (cached) return cached

  const missing: string[] = []
  const result = {} as Record<RequiredVar, string>

  for (const key of REQUIRED_VARS) {
    const value = process.env[key]
    if (!value) {
      missing.push(key)
    } else {
      result[key] = value
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `必須環境変数が未設定です: ${missing.join(', ')}`
    )
  }

  cached = result
  return result
}

/**
 * 個別取得（必須）。未設定なら throw。
 */
export function getEnv<K extends RequiredVar>(key: K): string {
  return requireEnv()[key]
}
