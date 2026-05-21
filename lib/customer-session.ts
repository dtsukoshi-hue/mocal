import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase-ssr'

/**
 * 顧客の Supabase Auth セッションを確保して User を返す。
 *
 * 振る舞い:
 *  - 既存セッションがあればその User を返す
 *  - 無ければ `supabase.auth.signInAnonymously()` で anonymous user を作成
 *  - Cookie はレスポンスに自動的にセットされる（@supabase/ssr 経由）
 *
 * 用途:
 *  - 顧客操作の Server Action / Route Handler の冒頭で呼ぶ
 *  - 以降のコードでは「user は必ず存在する」を保証
 *
 * 設計の意図 (docs/customer-auth-design.md):
 *  - Cart submit 時など、注文に踏み込む瞬間にのみ sign-in を発火させる
 *    （ページ閲覧では呼ばない = MAU 浪費を防ぐ）
 *  - 顧客認証の責務をこの primitive に集約。Server Action 側は
 *    `const user = await ensureCustomerSession()` だけで済む
 *  - 将来 #11 (email 認証顧客) を導入する際は、ここを拡張するだけで
 *    呼び出し側のコードは変えない
 *
 * RLS との関係 (F-18 修正後):
 *  - 既存 policy `orders_user_own_select USING (auth.uid() = user_id)` に
 *    乗ることで、顧客は自分の注文のみ Realtime / REST で読める
 *  - anonymous user の auth.uid() = 注文行の user_id を一致させるのが目的
 *
 * @throws Error - sign-in に失敗した場合（Supabase 障害等）
 */
export async function ensureCustomerSession(): Promise<User> {
  const supabase = await createSupabaseServerClient()
  const { data: { user: existing } } = await supabase.auth.getUser()
  if (existing) return existing

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) {
    throw new Error(
      `customer session sign-in failed: ${error?.message ?? 'no user returned'}`,
    )
  }
  return data.user
}

/**
 * 既存セッションがあれば User を返す。無ければ null。
 *
 * 読み取り系で「sign-in を発火させずに User があるかだけ知りたい」場合に使う。
 * 用途例: 顧客向け注文履歴 API での「ログイン状態の人だけ追加情報を返す」等。
 *
 * 注意: MAU を発生させないので、sign-in が必要な書き込み系では
 *      代わりに `ensureCustomerSession()` を使うこと。
 */
export async function getCustomerSession(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
