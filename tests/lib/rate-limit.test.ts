import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkRateLimit, checkRateLimitAsync, isRedisRateLimitEnabled } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  it('allows requests under the limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('k1', 5, 60_000)).toBe(true)
    }
  })

  it('blocks requests over the limit within window', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('k2', 3, 60_000)
    }
    expect(checkRateLimit('k2', 3, 60_000)).toBe(false)
  })

  it('resets the window after expiry', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('k3', 3, 60_000)
    }
    expect(checkRateLimit('k3', 3, 60_000)).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(checkRateLimit('k3', 3, 60_000)).toBe(true)
  })

  it('separates different keys', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('k4', 3, 60_000)
    }
    expect(checkRateLimit('k4', 3, 60_000)).toBe(false)
    expect(checkRateLimit('k5', 3, 60_000)).toBe(true)
  })
})

describe('checkRateLimitAsync (in-memory fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    // Upstash 環境変数が未設定なら fallback パスに入る前提
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('falls back to in-memory when Upstash env not set', async () => {
    expect(isRedisRateLimitEnabled()).toBe(false)
    expect(await checkRateLimitAsync('p1', 'ip-async-1', 2, 60_000)).toBe(true)
    expect(await checkRateLimitAsync('p1', 'ip-async-1', 2, 60_000)).toBe(true)
    expect(await checkRateLimitAsync('p1', 'ip-async-1', 2, 60_000)).toBe(false)
  })

  it('separates async limits by prefix and identifier', async () => {
    expect(await checkRateLimitAsync('p2', 'ipA', 1, 60_000)).toBe(true)
    expect(await checkRateLimitAsync('p2', 'ipA', 1, 60_000)).toBe(false)
    expect(await checkRateLimitAsync('p2', 'ipB', 1, 60_000)).toBe(true)
    expect(await checkRateLimitAsync('p3', 'ipA', 1, 60_000)).toBe(true)
  })
})
