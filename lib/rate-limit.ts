// レート制限の抽象化
// - UPSTASH_REDIS_REST_URL / TOKEN が設定されていれば Upstash Redis を使う（複数インスタンス間で共有）
// - 未設定なら module-level Map にフォールバック（単一インスタンスのみ有効）
//
// 既存の同期 API `checkRateLimit(key, max, windowMs): boolean` を維持するため、
// インメモリ専用の関数として残しつつ、非同期版 `checkRateLimitAsync` を追加する。

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ------------------------------------------------------------
// in-memory フォールバック（単一インスタンス用・既存挙動互換）
// ------------------------------------------------------------
const memoryStore = new Map<string, { count: number; resetAt: number }>()
const MEMORY_PRUNE_THRESHOLD = 1000

function pruneMemoryStore(now: number) {
  if (memoryStore.size < MEMORY_PRUNE_THRESHOLD) return
  for (const [key, record] of memoryStore) {
    if (record.resetAt < now) memoryStore.delete(key)
  }
}

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  pruneMemoryStore(now)
  const record = memoryStore.get(key)
  if (!record || record.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  record.count++
  return record.count <= max
}

// ------------------------------------------------------------
// Redis ベース（serverless 複数インスタンス対応）
// ------------------------------------------------------------
let redisClient: Redis | null = null
const limiterCache = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  if (redisClient) return redisClient
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  redisClient = new Redis({ url, token })
  return redisClient
}

function getLimiter(prefix: string, max: number, windowMs: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  const key = `${prefix}:${max}:${windowMs}`
  let limiter = limiterCache.get(key)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
      prefix: `mocal:rl:${prefix}`,
      analytics: false,
    })
    limiterCache.set(key, limiter)
  }
  return limiter
}

/**
 * 非同期レート制限チェック。Redis があればそちらを使い、無ければ in-memory にフォールバック。
 * - prefix: 用途識別子（例: 'login', 'order'）
 * - identifier: 制限の単位（IP など）
 * - max: ウィンドウ内の最大リクエスト数
 * - windowMs: ウィンドウ長（ミリ秒）
 */
export async function checkRateLimitAsync(
  prefix: string,
  identifier: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const limiter = getLimiter(prefix, max, windowMs)
  if (limiter) {
    try {
      const r = await limiter.limit(identifier)
      return r.success
    } catch {
      // Redis 障害時は in-memory にフォールバック（fail-open しない）
      return checkRateLimit(`${prefix}:${identifier}`, max, windowMs)
    }
  }
  return checkRateLimit(`${prefix}:${identifier}`, max, windowMs)
}

/** Redis が有効か（運用ログ・テスト用） */
export function isRedisRateLimitEnabled(): boolean {
  return getRedis() !== null
}
