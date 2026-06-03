/**
 * #62 PR-2: registerStoreAction + resumeStoreCreationAction のテスト
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// hoisted mocks
// ============================================================================

const supabaseServiceMock = vi.hoisted(() => {
  const handlers: Record<string, () => unknown> = {}
  const rpc = vi.fn()
  return {
    handlers,
    rpc,
    from: vi.fn((table: string) => {
      const fn = handlers[table]
      if (!fn) throw new Error(`unexpected from(${table})`)
      return fn()
    }),
  }
})

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => supabaseServiceMock),
}))

const authGetUserMock = vi.hoisted(() => vi.fn())
const authSignUpMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-ssr', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getUser: authGetUserMock,
      signUp: authSignUpMock,
    },
  })),
}))

const checkRateLimitMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: checkRateLimitMock,
}))

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
}))

const headersMock = vi.hoisted(() => ({
  get: vi.fn(() => '203.0.113.1'),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(headersMock),
}))

// redirect は throw して fast-return をシミュレート
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const err: Error & { __redirect?: string } = new Error(`REDIRECT:${url}`)
    err.__redirect = url
    throw err
  })
)
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

import { registerStoreAction, resumeStoreCreationAction } from '@/app/actions/onboarding'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const VALID_NEW = {
  store_name: 'mocal カフェ',
  slug: 'mocal-cafe',
  email: 'owner@mocal-cafe.jp',
  password: 'password123',
}

function setupNoExistingSlug() {
  supabaseServiceMock.handlers['stores'] = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  })
}

function setupExistingSlug() {
  supabaseServiceMock.handlers['stores'] = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'store-1' }, error: null }),
      }),
    }),
  })
}

function setupPendingSignupsUpsert(error: unknown = null) {
  supabaseServiceMock.handlers['pending_signups'] = () => ({
    upsert: vi.fn().mockResolvedValue({ error }),
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    update: () => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(supabaseServiceMock.handlers).forEach(k => delete supabaseServiceMock.handlers[k])
  checkRateLimitMock.mockResolvedValue(true)
  authGetUserMock.mockResolvedValue({ data: { user: null } })
  authSignUpMock.mockResolvedValue({
    // 通常時: identities は配列で 1 件以上 (email provider 等)
    data: { user: { id: 'auth-user-1', identities: [{ provider: 'email' }] } },
    error: null,
  })
})

// ============================================================================
// registerStoreAction: rate limit
// ============================================================================

describe('registerStoreAction: rate limit', () => {
  it('rate limit 超過 → error', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false)
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toEqual({
      error: 'リクエストが多すぎます。しばらく時間をおいてからお試しください。',
      field: 'general',
    })
  })
})

// ============================================================================
// registerStoreAction: form validation
// ============================================================================

describe('registerStoreAction: validation', () => {
  it('店舗名が空 → error (field=store_name)', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, store_name: '' }))
    expect(res).toMatchObject({ field: 'store_name' })
  })

  it('slug が空 → error (field=slug)', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, slug: '' }))
    expect(res).toMatchObject({ field: 'slug' })
  })

  it('slug 形式不正 (短すぎ) → error (field=slug)', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, slug: 'ab' }))
    expect(res).toMatchObject({ field: 'slug' })
  })

  it('slug 形式不正 (記号) → error', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, slug: 'my_store!' }))
    expect(res).toMatchObject({ field: 'slug' })
  })

  it('slug が予約語 (admin) → error', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, slug: 'admin' }))
    expect(res).toMatchObject({
      field: 'slug',
      error: expect.stringContaining('予約語'),
    })
  })

  it('slug が予約語 (大文字 ADMIN) → error', async () => {
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, slug: 'ADMIN' }))
    expect(res).toMatchObject({ field: 'slug' })
  })

  it('未ログインで password 不足 → error (field=password)', async () => {
    setupNoExistingSlug()
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, password: 'short' }))
    expect(res).toMatchObject({ field: 'password' })
  })

  it('未ログインで email が空 → error (field=email)', async () => {
    setupNoExistingSlug()
    const res = await registerStoreAction(undefined, fd({ ...VALID_NEW, email: '' }))
    expect(res).toMatchObject({ field: 'email' })
  })
})

// ============================================================================
// registerStoreAction: slug 重複事前 check
// ============================================================================

describe('registerStoreAction: slug 重複事前 check', () => {
  it('既存 slug → error (field=slug、signUp 実行されない)', async () => {
    setupExistingSlug()
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({
      field: 'slug',
      error: expect.stringContaining('既に使われています'),
    })
    expect(authSignUpMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// registerStoreAction: mode (A) 新規 signup
// ============================================================================

describe('registerStoreAction: mode=new-signup', () => {
  it('正常系: signUp + pending_signups UPSERT → ok=sent', async () => {
    setupNoExistingSlug()
    setupPendingSignupsUpsert()
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toEqual({ ok: true, mode: 'sent', email: VALID_NEW.email })
    expect(authSignUpMock).toHaveBeenCalledWith(expect.objectContaining({
      email: VALID_NEW.email,
      password: VALID_NEW.password,
      options: expect.objectContaining({
        emailRedirectTo: expect.stringContaining('/auth/confirm'),
      }),
    }))
  })

  it('signUp で email 既登録 → error (field=email、誘導文)', async () => {
    setupNoExistingSlug()
    authSignUpMock.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, message: 'User already registered' },
    })
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({
      field: 'email',
      error: expect.stringContaining('店舗を追加'),
    })
  })

  it('signUp で obfuscated user (identities=[]、enumeration 防止挙動) → 既登録扱い', async () => {
    setupNoExistingSlug()
    // Supabase は confirmed email の signUp に対し error を返さず identities が
    // 空の user object を返す (PR-2 hotfix で検出ロジック追加)
    authSignUpMock.mockResolvedValueOnce({
      data: { user: { id: 'fake-obfuscated-uuid', identities: [] } },
      error: null,
    })
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({
      field: 'email',
      error: expect.stringContaining('店舗を追加'),
    })
    // pending_signups upsert は実行されない
    expect(supabaseServiceMock.handlers['pending_signups']).toBeUndefined()
  })

  it('signUp で予期せぬエラー → general error + Sentry/logger.error', async () => {
    setupNoExistingSlug()
    authSignUpMock.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 500, message: 'database error' },
    })
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({ field: 'general' })
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('pending_signups UPSERT 失敗 → general error', async () => {
    setupNoExistingSlug()
    setupPendingSignupsUpsert({ message: 'pending upsert failed' })
    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({ field: 'general' })
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('pending_signups UPSERT で FK violation (23503) → defense in depth で既登録扱い', async () => {
    // identities=[] 検出をすり抜けた obfuscated user (将来 supabase-js が形式変更した
    // 場合の保険) を FK violation 経由で検出
    setupNoExistingSlug()
    authSignUpMock.mockResolvedValueOnce({
      // identities undefined (仮想的な変更後挙動)、user.id は実在しない UUID
      data: { user: { id: 'fake-uuid-not-in-auth-users' } },
      error: null,
    })
    setupPendingSignupsUpsert({ code: '23503', message: 'fk violation' })

    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({
      field: 'email',
      error: expect.stringContaining('店舗を追加'),
    })
    // error ではなく warn (Sentry 上で error 大量発生にならないように)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('FK violation'),
      expect.objectContaining({ code: '23503' })
    )
    expect(loggerMock.error).not.toHaveBeenCalled()
  })
})

// ============================================================================
// registerStoreAction: mode (B) ログイン中 (多店舗)
// ============================================================================

describe('registerStoreAction: mode=add-store', () => {
  beforeEach(() => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'existing-user-1' } } })
  })

  it('正常系: RPC 成功 → redirect to /admin/settings', async () => {
    setupNoExistingSlug()
    supabaseServiceMock.rpc.mockResolvedValueOnce({ data: 'new-store-1', error: null })

    await expect(
      registerStoreAction(undefined, fd(VALID_NEW))
    ).rejects.toThrow('REDIRECT:/admin/settings?welcome=1&store_id=new-store-1')

    expect(supabaseServiceMock.rpc).toHaveBeenCalledWith('create_store_with_owner', {
      p_name: VALID_NEW.store_name,
      p_slug: VALID_NEW.slug,
      p_user_id: 'existing-user-1',
    })
    expect(authSignUpMock).not.toHaveBeenCalled()
  })

  it('RPC で slug_taken (race) → error (field=slug)', async () => {
    setupNoExistingSlug()
    supabaseServiceMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'slug_taken' },
    })

    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({
      field: 'slug',
      error: expect.stringContaining('既に使われています'),
    })
  })

  it('RPC でその他エラー → general error + logger.error', async () => {
    setupNoExistingSlug()
    supabaseServiceMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const res = await registerStoreAction(undefined, fd(VALID_NEW))
    expect(res).toMatchObject({ field: 'general' })
    expect(loggerMock.error).toHaveBeenCalled()
  })
})

// ============================================================================
// resumeStoreCreationAction
// ============================================================================

describe('resumeStoreCreationAction', () => {
  function setupPending(pending: unknown) {
    supabaseServiceMock.handlers['pending_signups'] = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: pending, error: null }),
        }),
      }),
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
  }

  it('未ログイン → error', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } })
    const res = await resumeStoreCreationAction(undefined, fd({}))
    expect(res).toMatchObject({ error: expect.stringContaining('ログイン') })
  })

  it('pending 行なし → error', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupPending(null)
    const res = await resumeStoreCreationAction(undefined, fd({}))
    expect(res).toMatchObject({ error: expect.stringContaining('再試行できる') })
  })

  it('pending status=completed → redirect to /admin/settings', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupPending({ store_name: 'X', slug: 'x', status: 'completed', error_count: 0 })
    await expect(resumeStoreCreationAction(undefined, fd({}))).rejects.toThrow(
      'REDIRECT:/admin/settings?welcome=1'
    )
  })

  it('正常系: RPC 成功 → pending update + redirect', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupPending({ store_name: 'X', slug: 'x', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({ data: 'store-99', error: null })

    await expect(resumeStoreCreationAction(undefined, fd({}))).rejects.toThrow(
      'REDIRECT:/admin/settings?welcome=1&store_id=store-99'
    )
  })

  it('RPC で slug_taken → redirect to /onboarding?error=slug_taken', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupPending({ store_name: '私のカフェ', slug: 'x', status: 'pending', error_count: 0 })
    supabaseServiceMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'slug_taken' },
    })

    await expect(resumeStoreCreationAction(undefined, fd({}))).rejects.toThrow(
      /REDIRECT:\/onboarding\?error=slug_taken&name=/
    )
  })
})
