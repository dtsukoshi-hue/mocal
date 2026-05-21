import 'server-only'

// 構造化ログ
// JSON 1行 = 1イベント。Vercel / 集約ログサービスで grep / parse しやすい形式。
// TODO(#15 / F-12): Sentry 導入時にこの emit() を Sentry.captureException 等に
// 差し替える。errorToFields() の error_stack はそのまま渡さず、フルパスを
// 含まないよう sanitize するかを #15 で検討する。

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogFields {
  [key: string]: unknown
}

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
