import 'server-only'
import * as Sentry from '@sentry/nextjs'

// Sentry Cron Monitor のラッパ。
// SENTRY_DSN 未設定なら全 method が no-op を返す。
//
// 使い方:
//   const monitor = startCronCheckIn('no-show', '* * * * *')
//   try {
//     // ... cron 本体処理
//     monitor.ok()
//   } catch (e) {
//     monitor.error()
//     throw e
//   }

interface CronTracker {
  ok: () => void
  error: () => void
}

const NOOP: CronTracker = {
  ok: () => {},
  error: () => {},
}

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

  return {
    ok: () => Sentry.captureCheckIn({ checkInId, monitorSlug, status: 'ok' }),
    error: () => Sentry.captureCheckIn({ checkInId, monitorSlug, status: 'error' }),
  }
}
