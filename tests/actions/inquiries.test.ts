/**
 * submitInquiryAction のテスト
 * recovery-plan §5.2 Phase R-4 (L9 / #40)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseMock = vi.hoisted(() => {
  const handlers: Record<string, () => unknown> = {}
  return {
    handlers,
    from: vi.fn((table: string) => {
      const fn = handlers[table]
      if (!fn) throw new Error(`unexpected from(${table})`)
      return fn()
    }),
  }
})

vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(() => supabaseMock),
}))

const checkRateLimitMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: checkRateLimitMock,
}))

const sendEmailMock = vi.hoisted(() => vi.fn())
const escapeHtmlMock = vi.hoisted(() => (s: string) => s)
vi.mock('@/lib/email', () => ({
  sendEmail: sendEmailMock,
  escapeHtml: escapeHtmlMock,
}))

const headersMock = vi.hoisted(() => ({
  get: vi.fn(() => '127.0.0.1'),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(headersMock),
}))

import { submitInquiryAction } from '@/app/actions/inquiries'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const VALID = {
  name: '田中太郎',
  store_name: 'テスト店舗',
  email: 'test@example.com',
  message: 'よろしくお願いします',
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(supabaseMock.handlers).forEach(k => delete supabaseMock.handlers[k])
  checkRateLimitMock.mockResolvedValue(true)
  sendEmailMock.mockResolvedValue(undefined)
  delete process.env.INQUIRY_NOTIFICATION_EMAIL

  supabaseMock.handlers['store_inquiries'] = () => ({
    insert: vi.fn().mockResolvedValue({ error: null }),
  })
})

describe('submitInquiryAction', () => {
  it('必須欠落 → error', async () => {
    const res = await submitInquiryAction(undefined, fd({ ...VALID, name: '' }))
    expect(res).toEqual({ error: 'お名前・店舗名・メールアドレスは必須です。' })
  })

  it('email 形式不正 → error', async () => {
    const res = await submitInquiryAction(undefined, fd({ ...VALID, email: 'not-an-email' }))
    expect(res).toEqual({ error: 'メールアドレスの形式が正しくありません。' })
  })

  it('長さ超過 → error', async () => {
    const res = await submitInquiryAction(undefined, fd({ ...VALID, name: 'x'.repeat(101) }))
    expect(res).toEqual({ error: '入力内容が長すぎます。' })
  })

  it('レート制限超過 → error', async () => {
    checkRateLimitMock.mockResolvedValueOnce(false)
    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toMatchObject({ error: expect.stringContaining('しばらく') })
  })

  it('正常: DB insert 成功 → success', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    supabaseMock.handlers['store_inquiries'] = () => ({ insert: insertMock })

    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toEqual({ success: true })
    expect(insertMock).toHaveBeenCalledWith({
      name: VALID.name,
      store_name: VALID.store_name,
      email: VALID.email,
      message: VALID.message,
    })
  })

  it('DB insert 失敗 → error (email は呼ばれない)', async () => {
    supabaseMock.handlers['store_inquiries'] = () => ({
      insert: vi.fn().mockResolvedValue({ error: { message: 'db down' } }),
    })

    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toMatchObject({ error: expect.stringContaining('送信に失敗') })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('INQUIRY_NOTIFICATION_EMAIL 未設定 → email 呼ばれない', async () => {
    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toEqual({ success: true })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('INQUIRY_NOTIFICATION_EMAIL 設定 → email 呼ばれる', async () => {
    process.env.INQUIRY_NOTIFICATION_EMAIL = 'admin@mocal.jp'

    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toEqual({ success: true })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@mocal.jp',
      replyTo: VALID.email,
      subject: expect.stringContaining(VALID.store_name),
    }))
  })

  it('email 送信失敗でも success を返す (best-effort)', async () => {
    process.env.INQUIRY_NOTIFICATION_EMAIL = 'admin@mocal.jp'
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'))

    const res = await submitInquiryAction(undefined, fd(VALID))
    expect(res).toEqual({ success: true })
  })
})
