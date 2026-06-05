/**
 * lib/sentry-cron.ts: serverless 環境での Sentry check-in 損失防止
 *
 * 過去事故: 2026-06-02〜06-05、no-show cron で 3K timeout events 蓄積。
 * 原因は ok()/error() が fire-and-forget で Sentry.flush() なし → Vercel function
 * return 直後に runtime kill → SDK 内部キューの check-in event lost。
 *
 * 本テストは「await monitor.ok() / monitor.error() が必ず Sentry.flush() を
 * 完了してから resolve する」ことを verify する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureCheckInMock = vi.hoisted(() => vi.fn(() => 'check-in-id-xyz'))
const flushMock = vi.hoisted(() => vi.fn().mockResolvedValue(true))

vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: captureCheckInMock,
  flush: flushMock,
}))

import { startCronCheckIn } from '@/lib/sentry-cron'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SENTRY_DSN = 'https://test@sentry.io/123'
})

describe('startCronCheckIn — serverless flush 必須', () => {
  it('start で in_progress check-in が送られる', () => {
    startCronCheckIn('no-show', '* * * * *')
    expect(captureCheckInMock).toHaveBeenCalledWith(
      { monitorSlug: 'no-show', status: 'in_progress' },
      expect.objectContaining({
        schedule: { type: 'crontab', value: '* * * * *' },
        maxRuntime: 5,
        checkinMargin: 5,
      })
    )
  })

  it('monitor.ok() が ok check-in + flush を await する', async () => {
    const monitor = startCronCheckIn('no-show', '* * * * *')
    captureCheckInMock.mockClear()

    await monitor.ok()

    expect(captureCheckInMock).toHaveBeenCalledWith({
      checkInId: 'check-in-id-xyz',
      monitorSlug: 'no-show',
      status: 'ok',
    })
    expect(flushMock).toHaveBeenCalledWith(2000) // timeout ms
  })

  it('monitor.error() が error check-in + flush を await する', async () => {
    const monitor = startCronCheckIn('store-hours', '0 * * * *')
    captureCheckInMock.mockClear()

    await monitor.error()

    expect(captureCheckInMock).toHaveBeenCalledWith({
      checkInId: 'check-in-id-xyz',
      monitorSlug: 'store-hours',
      status: 'error',
    })
    expect(flushMock).toHaveBeenCalledWith(2000)
  })

  it('flush が throw しても cron 本体に波及しない', async () => {
    flushMock.mockRejectedValueOnce(new Error('Sentry network down'))
    const monitor = startCronCheckIn('no-show', '* * * * *')

    // throw されない (cron 本体への波及防止)
    await expect(monitor.ok()).resolves.toBeUndefined()
  })

  it('SENTRY_DSN 未設定なら no-op (flush 呼ばれない)', async () => {
    delete process.env.SENTRY_DSN
    const monitor = startCronCheckIn('no-show', '* * * * *')

    captureCheckInMock.mockClear()
    flushMock.mockClear()

    await monitor.ok()
    await monitor.error()

    expect(captureCheckInMock).not.toHaveBeenCalled()
    expect(flushMock).not.toHaveBeenCalled()
  })
})
