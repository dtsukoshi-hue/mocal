import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    // Next.js の redirect は throw する（テスト用に同じ振る舞い）
    throw new Error(`__redirect__:${url}`)
  }),
}))

import { logoutAction } from '@/app/actions/auth'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logoutAction', () => {
  it('redirects to login', async () => {
    await expect(logoutAction()).rejects.toThrow('__redirect__:/admin/login')
  })
})
