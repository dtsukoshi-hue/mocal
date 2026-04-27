import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

async function freshEnv() {
  vi.resetModules()
  return await import('@/lib/env')
}

describe('env', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns all required vars when present', async () => {
    const { requireEnv } = await freshEnv()
    const env = requireEnv()
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
    expect(env.SESSION_SECRET).toBeTruthy()
    expect(env.STRIPE_SECRET_KEY).toBeTruthy()
  })

  it('throws with missing variable names listed', async () => {
    delete process.env.SESSION_SECRET
    delete process.env.STRIPE_SECRET_KEY
    const { requireEnv } = await freshEnv()
    expect(() => requireEnv()).toThrow(/SESSION_SECRET/)
    expect(() => requireEnv()).toThrow(/STRIPE_SECRET_KEY/)
  })

  it('does not leak environment values in error message', async () => {
    process.env.SESSION_SECRET = 'sensitive-value-123'
    delete process.env.STRIPE_SECRET_KEY
    const { requireEnv } = await freshEnv()
    try {
      requireEnv()
      // unreachable
      expect.fail('should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('STRIPE_SECRET_KEY')
      expect(msg).not.toContain('sensitive-value-123')
    }
  })

  it('getEnv returns specific variable', async () => {
    const { getEnv } = await freshEnv()
    expect(getEnv('SESSION_SECRET')).toBe('test-secret-for-vitest-only')
  })

  it('caches result after first call', async () => {
    const { requireEnv } = await freshEnv()
    const a = requireEnv()
    const b = requireEnv()
    expect(a).toBe(b) // 同一参照
  })
})
