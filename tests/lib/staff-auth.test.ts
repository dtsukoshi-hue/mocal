import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}))

import {
  validateEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  authenticateStaff,
} from '@/lib/staff-auth'
import { createServiceClient } from '@/lib/supabase-server'

const STORE_ID = '11111111-1111-4111-8111-111111111111'

describe('validateEmail', () => {
  it.each([
    'user@example.com',
    'a@b.co',
    'first.last+tag@sub.example.org',
  ])('accepts %s', (e) => {
    expect(validateEmail(e).ok).toBe(true)
  })

  it.each([
    '',
    'no-at-sign',
    'two@@at.com',
    'spaces in@email.com',
    'no-domain@',
    '@no-local.com',
  ])('rejects %s', (e) => {
    expect(validateEmail(e).ok).toBe(false)
  })

  it('rejects too long emails', () => {
    const long = 'a'.repeat(250) + '@b.co'
    expect(validateEmail(long).ok).toBe(false)
  })
})

describe('validatePassword', () => {
  it('accepts 8+ char password', () => {
    expect(validatePassword('password123').ok).toBe(true)
  })

  it.each([
    [''],
    ['short'],
    ['1234567'],  // 7 chars
  ])('rejects too short %s', (p) => {
    expect(validatePassword(p).ok).toBe(false)
  })

  it('rejects too long', () => {
    expect(validatePassword('a'.repeat(129)).ok).toBe(false)
  })
})

describe('hashPassword + verifyPassword', () => {
  it('roundtrips password', async () => {
    const hash = await hashPassword('correct-password')
    expect(hash).not.toBe('correct-password')
    expect(await verifyPassword('correct-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('returns false on invalid hash without throwing', async () => {
    expect(await verifyPassword('any', 'not-a-bcrypt-hash')).toBe(false)
  })
})

describe('authenticateStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when email not found (still costs time)', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as never)

    const r = await authenticateStaff('nope@example.com', 'password123')
    expect(r).toBeNull()
  })

  it('returns null when password incorrect', async () => {
    const hash = await hashPassword('correct-pass')
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'sid', store_id: STORE_ID, email: 'a@b.com',
                  password_hash: hash, role: 'staff',
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never)

    const r = await authenticateStaff('a@b.com', 'wrong-pass')
    expect(r).toBeNull()
  })

  it('returns staff payload on correct credentials', async () => {
    const hash = await hashPassword('correct-pass')
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'sid', store_id: STORE_ID, email: 'a@b.com',
                  password_hash: hash, role: 'staff',
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never)

    const r = await authenticateStaff('a@b.com', 'correct-pass')
    expect(r).toMatchObject({
      ok: true,
      storeId: STORE_ID,
      email: 'a@b.com',
      role: 'staff',
    })
  })

  it('normalizes email to lowercase before lookup', async () => {
    const eq = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq }),
      }),
    } as never)

    await authenticateStaff('  USER@EXAMPLE.COM  ', 'pw')
    expect(eq).toHaveBeenCalledWith('email', 'user@example.com')
  })
})
