import 'server-only'
import * as Sentry from '@sentry/nextjs'

// Sentry Cron Monitor のラッパ。
// SENTRY_DSN 未設定なら全 method が no-op を返す。
//
// 使い方:
//   const monitor = startCronCheckIn('no-show', '* * * * *')
//   try {
//     // ... cron 本体処理
//     await monitor.ok()
//   } catch (e) {
//     await monitor.error()
//     throw e
//   }
//
// ⚠️ ok() / error() は **必ず await** すること。
//   serverless (Vercel) では function return 直後に runtime が kill され、
//   await なしだと Sentry SDK の内部キューに event が残ったまま loss する
//   (cron-job.org は 200 OK 受信、しかし Sentry は check-in 未着 → timeout 判定)
//   過去事故: 2026-06-02〜06-05、no-show で 3K timeout events 蓄積。

interface CronTracker {
  ok: () => Promise<void>
  error: () => Promise<void>
}

const NOOP: CronTracker = {
  ok: async () => {},
  error: async () => {},
}

// flush の timeout (ms)。Vercel function の余裕時間内に収める。
const FLUSH_TIMEOUT_MS = 2000

export function startCronCheckIn(monitorSlug: string, cronSchedule: string): CronTracker {
  if (!process.env.SENTRY_DSN) return NOOP

  const checkInId = Sentry.captureCheckIn(
    { monitorSlug, status: 'in_progress' },
    {
      schedule: { type: 'crontab', value: cronSchedule },
      // 想定される最大実行時間 (cron-job.org のタイムアウト分にも対応)
      maxRuntime: 5,
      // checkinMargin = cron 発火の遅延許容 (分)
      checkinMargin: 5,
    }
  )

  const finish = async (status: 'ok' | 'error'): Promise<void> => {
    Sentry.captureCheckIn({ checkInId, monitorSlug, status })
    // serverless で event loss を防ぐため flush 必須。
    // flush の戻り値 (sent within timeout) は無視 (best-effort、cron 処理は既に完了済)
    try {
      await Sentry.flush(FLUSH_TIMEOUT_MS)
    } catch {
      // Sentry 障害時の影響を cron 本体に波及させない
    }
  }

  return {
    ok: () => finish('ok'),
    error: () => finish('error'),
  }
}
