import 'server-only'
import * as Sentry from '@sentry/nextjs'

// 構造化ログ
// JSON 1行 = 1イベント。Vercel / 集約ログサービスで grep / parse しやすい形式。
//
// #15 Sentry 統合 (2026-05-28):
//   - SENTRY_DSN 未設定: 従来通り console.* のみ。Sentry SDK は no-op
//   - SENTRY_DSN 設定済: 全 level で breadcrumb 追加、error は captureException
//   - PII sanitize は sentry.server.config.ts の beforeSend で実施

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogFields {
  [key: string]: unknown
}

const SENTRY_ENABLED = Boolean(process.env.SENTRY_DSN)

function emit(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  }
  // 本番では console.log → Vercel が JSON として収集
  // error は console.error に振って alerting の対象にしやすくする
  if (level === 'error') {
    console.error(JSON.stringify(entry))
  } else {
    console.log(JSON.stringify(entry))
  }

  if (SENTRY_ENABLED) {
    // breadcrumb: 全 level で常時追加 (error 発生時のコンテキスト)
    Sentry.addBreadcrumb({
      level: level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warning' : 'error',
      message,
      data: fields,
    })
    // error level は exception として capture
    if (level === 'error') {
      const errCandidate = fields?.error
      if (errCandidate instanceof Error) {
        Sentry.captureException(errCandidate, { extra: fields })
      } else {
        Sentry.captureMessage(message, { level: 'error', extra: fields })
      }
    }
  }
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
  info:  (msg: string, fields?: LogFields) => emit('info', msg, fields),
  warn:  (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
}

// Error → JSON 化のヘルパー
export function errorToFields(e: unknown): LogFields {
  if (e instanceof Error) {
    return {
      error_name: e.name,
      error_message: e.message,
      error_stack: e.stack,
    }
  }
  return { error: String(e) }
}
