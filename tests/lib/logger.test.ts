import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// @sentry/nextjs を mock。実装側で `if (SENTRY_ENABLED) Sentry.xxx(...)` が
// 正しく分岐するかを verify する。
const sentryMock = {
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}

vi.mock('@sentry/nextjs', () => sentryMock)

// import は dynamic で行う（process.env.SENTRY_DSN を test ごとに切り替えるため、
// module レベル定数 SENTRY_ENABLED の評価タイミングを制御する）
async function importLogger() {
  vi.resetModules()
  return await import('@/lib/logger')
}

describe('lib/logger', () => {
  const originalEnv = { ...process.env }
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    sentryMock.addBreadcrumb.mockClear()
    sentryMock.captureException.mockClear()
    sentryMock.captureMessage.mockClear()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('SENTRY_DSN 未設定 (default state)', () => {
    beforeEach(() => {
      delete process.env.SENTRY_DSN
    })

    it('logger.info() は console.log のみ呼び Sentry は呼ばない', async () => {
      const { logger } = await importLogger()
      logger.info('hello', { foo: 'bar' })

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled()
      expect(sentryMock.captureException).not.toHaveBeenCalled()
      expect(sentryMock.captureMessage).not.toHaveBeenCalled()
    })

    it('logger.error() は console.error のみ呼び Sentry は呼ばない', async () => {
      const { logger } = await importLogger()
      logger.error('boom', { code: 500 })

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(sentryMock.addBreadcrumb).not.toHaveBeenCalled()
      expect(sentryMock.captureException).not.toHaveBeenCalled()
    })
  })

  describe('SENTRY_DSN 設定済', () => {
    beforeEach(() => {
      process.env.SENTRY_DSN = 'https://test@o0.ingest.sentry.io/0'
    })

    it('logger.info() は console + Sentry breadcrumb を呼ぶ', async () => {
      const { logger } = await importLogger()
      logger.info('hello', { foo: 'bar' })

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(sentryMock.addBreadcrumb).toHaveBeenCalledTimes(1)
      expect(sentryMock.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', message: 'hello' }),
      )
      expect(sentryMock.captureException).not.toHaveBeenCalled()
    })

    it('logger.warn() は breadcrumb level を "warning" にマッピング', async () => {
      const { logger } = await importLogger()
      logger.warn('careful')

      expect(sentryMock.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warning' }),
      )
    })

    it('logger.error(msg, {error: Error}) は captureException を呼ぶ', async () => {
      const { logger } = await importLogger()
      const err = new Error('something failed')
      logger.error('boom', { error: err })

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(sentryMock.addBreadcrumb).toHaveBeenCalledTimes(1)
      expect(sentryMock.captureException).toHaveBeenCalledTimes(1)
      expect(sentryMock.captureException).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ extra: expect.objectContaining({ error: err }) }),
      )
      expect(sentryMock.captureMessage).not.toHaveBeenCalled()
    })

    it('logger.error(msg, fields) で error フィールド未指定なら captureMessage', async () => {
      const { logger } = await importLogger()
      logger.error('config missing', { key: 'STRIPE_CLIENT_ID' })

      expect(sentryMock.captureException).not.toHaveBeenCalled()
      expect(sentryMock.captureMessage).toHaveBeenCalledTimes(1)
      expect(sentryMock.captureMessage).toHaveBeenCalledWith(
        'config missing',
        expect.objectContaining({ level: 'error' }),
      )
    })
  })
})
