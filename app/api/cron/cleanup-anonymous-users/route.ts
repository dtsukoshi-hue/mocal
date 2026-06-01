import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { logger } from '@/lib/logger'
import { startCronCheckIn } from '@/lib/sentry-cron'

/**
 * Anonymous user cleanup cron (#34)
 *
 * Supabase Anonymous Sign-Ins で作成された auth.users のうち、
 * `is_anonymous=true` かつ `last_sign_in_at` が `RETENTION_DAYS` 以上前の
 * ものを削除する。注文 (orders) は user_id を NULL に setting して保持
 * される（migration 20260522064802 で ON DELETE SET NULL 設定済）。
 *
 * Auth:
 *   - CRON_SECRET Bearer ヘッダー（他の cron と同じ）
 *
 * Feature flag:
 *   - CLEANUP_ANON_USERS_ENABLED=1 のときのみ実際に削除を行う。
 *   - 未設定なら dry-run と同等の動作（候補数のみ返す、実削除なし）。
 *   - pilot phase は default off にする想定。
 *
 * Dry-run:
 *   - ?dry=1 で削除対象の候補数のみ返す（feature flag に関わらず実削除しない）
 *
 * バッチサイズ:
 *   - 1 回の cron 起動につき最大 `BATCH_SIZE` ユーザーを削除
 *   - 超過分は次回の cron で処理（Vercel function timeout 対策）
 *
 * 顧客への影響:
 *   - 削除された anonymous user の過去注文は orders.user_id=NULL になるが
 *     localStorage の UUID + /api/orders/lookup (service_role) で
 *     引き続き閲覧可能。Realtime は失われるが terminal 注文では不要。
 *   - 新規注文時は signInAnonymously が自動的に新 user を作成 → 透明な体験。
 *
 * 推奨実行頻度: 日次 (cron-job.org 等の外部スケジューラ経由)
 */

const RETENTION_DAYS = 90
const BATCH_SIZE     = 100
const LIST_PAGE_SIZE = 1000

export async function GET(request: NextRequest) {
  // CRON_SECRET 必須化 (#48 code-review finding 5)
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET が設定されていません。' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  // Sentry Cron Monitor (DSN 未設定なら no-op)
  const monitor = startCronCheckIn('cleanup-anonymous-users', '0 3 * * *')

  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  const enabled = process.env.CLEANUP_ANON_USERS_ENABLED === '1'
  const effectiveDryRun = dryRun || !enabled

  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // Step 1: anonymous user を全件取得（pagination：1000/page × 必要分）
  // Supabase User 型に合わせて last_sign_in_at?: string (optional, undefined 可)
  const allUsers: { id: string; is_anonymous?: boolean; last_sign_in_at?: string; created_at: string }[] = []
  let page = 1
  // 安全装置: 最大 10 ページ = 10,000 ユーザーまで（mocal pilot 想定）
  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: LIST_PAGE_SIZE })
    if (error) {
      logger.error('cleanup-anonymous-users: listUsers failed', { code: error.code, message: error.message })
      monitor.error()
      return NextResponse.json({ error: 'listUsers failed', message: error.message }, { status: 500 })
    }
    const users = data?.users ?? []
    allUsers.push(...users)
    if (users.length < LIST_PAGE_SIZE) break  // 最終ページ
    page++
  }

  // Step 2: 削除候補の絞り込み
  const candidates = allUsers.filter((u) => {
    if (u.is_anonymous !== true) return false  // real user は絶対除外
    const ref = u.last_sign_in_at ?? u.created_at  // last_sign_in が未設定なら created_at
    return new Date(ref) < cutoff
  })

  // Step 3: dry-run / feature flag off ならここで終了
  if (effectiveDryRun) {
    monitor.ok()
    return NextResponse.json({
      ok: true,
      dryRun: true,
      enabled,
      retentionDays: RETENTION_DAYS,
      candidates: candidates.length,
      totalScanned: allUsers.length,
    })
  }

  // Step 4: 実削除（バッチサイズ上限まで）
  const targets = candidates.slice(0, BATCH_SIZE)
  let deleted = 0
  const errors: { id: string; message: string }[] = []
  for (const u of targets) {
    const { error } = await supabase.auth.admin.deleteUser(u.id)
    if (error) {
      logger.error('cleanup-anonymous-users: deleteUser failed', {
        userId: u.id, code: error.code, message: error.message,
      })
      errors.push({ id: u.id, message: error.message })
    } else {
      deleted++
    }
  }

  logger.info('cleanup-anonymous-users completed', {
    deleted,
    skipped: candidates.length - targets.length,  // バッチサイズ超過分
    errors: errors.length,
    totalScanned: allUsers.length,
  })

  // Cron 全体としては成功 (deleteUser の個別 error は logger.error で記録済)
  monitor.ok()
  return NextResponse.json({
    ok: true,
    dryRun: false,
    deleted,
    deferred: candidates.length - targets.length,  // 次回 cron 持ち越し
    errors: errors.length > 0 ? errors : undefined,
    totalScanned: allUsers.length,
  })
}
