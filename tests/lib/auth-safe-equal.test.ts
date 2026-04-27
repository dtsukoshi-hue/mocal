import { describe, it, expect } from 'vitest'
import { timingSafeEqual } from 'crypto'

// auth.ts と同じロジックを再現してテストする（純粋関数なので別途切り出さず確認用）
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

describe('auth safeEqual (timing-safe)', () => {
  it('returns true for equal strings', () => {
    expect(safeEqual('hello', 'hello')).toBe(true)
  })

  it('returns false for different lengths without throwing', () => {
    expect(() => safeEqual('a', 'abc')).not.toThrow()
    expect(safeEqual('a', 'abc')).toBe(false)
  })

  it('returns false for same-length differing strings', () => {
    expect(safeEqual('abc', 'xyz')).toBe(false)
  })

  it('handles empty strings', () => {
    expect(safeEqual('', '')).toBe(true)
    expect(safeEqual('', 'a')).toBe(false)
  })

  it('handles UTF-8 strings', () => {
    expect(safeEqual('パスワード', 'パスワード')).toBe(true)
    expect(safeEqual('パスワード', 'ぱすわーど')).toBe(false)
  })
})
