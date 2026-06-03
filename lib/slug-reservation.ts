/**
 * #62 PR-2: 店舗 slug 予約語チェック
 *
 * mocal の app route (`app/[slug]/page.tsx` 等) と衝突する予約語、
 * 将来の infrastructure ルート (`www`, `app`, `dashboard` 等) を reject する。
 *
 * 既存 slug regex (`/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/`) は形式のみ check。
 * 本関数は形式 OK な slug の中から「使われると app が壊れる」ものを reject する。
 *
 * 将来 admin UI で予約語の追加/削除が必要になったら DB テーブル化する想定だが、
 * 現状は変更頻度が低いため static set で十分。
 */

const RESERVED_SLUGS = new Set<string>([
  // mocal の既存 app route
  'admin',
  'api',
  'auth',
  'onboarding',
  'tokushoho',
  'privacy',
  'inquiries',
  'orders',
  // 将来 / 一般的な infra route
  'www',
  'app',
  'dashboard',
  'help',
  'support',
  'blog',
  'docs',
  'about',
  'contact',
  'faq',
  'terms',
  'legal',
  'login',
  'logout',
  'signup',
  'signin',
  'register',
  // Next.js 内部
  '_next',
  '_vercel',
  'static',
  'public',
])

/**
 * 与えられた slug が予約語かを判定する。
 * 大文字小文字は無視 (lower-cased で比較)。
 */
export function isSlugReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase())
}

/**
 * テスト用: 予約語の一覧を取得 (read-only)
 */
export function getReservedSlugs(): readonly string[] {
  return Array.from(RESERVED_SLUGS)
}
