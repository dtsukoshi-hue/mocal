/**
 * lib/dal.ts の isPlatformAdmin() helper の unit test。
 *
 * Platform admin は加盟店問い合わせ (個人情報含む) を見られる権限なので、
 * email の判定ロジックに穴が無いことを確認する。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isPlatformAdmin } from '@/lib/dal'

const KEY = 'MOCAL_PLATFORM_ADMIN_EMAILS'

describe('isPlatformAdmin', () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env[KEY]
  })

  afterEach(() => {
    if (original === undefined) delete process.env[KEY]
    else process.env[KEY] = original
  })

  it('env 未設定なら誰でも false (安全 default)', () => {
    delete process.env[KEY]
    expect(isPlatformAdmin('d.tsukoshi@gmail.com')).toBe(false)
  })

  it('env 空文字でも誰でも false', () => {
    process.env[KEY] = ''
    expect(isPlatformAdmin('d.tsukoshi@gmail.com')).toBe(false)
  })

  it('email が null / undefined / 空文字なら false', () => {
    process.env[KEY] = 'admin@mocal.jp'
    expect(isPlatformAdmin(null)).toBe(false)
    expect(isPlatformAdmin(undefined)).toBe(false)
    expect(isPlatformAdmin('')).toBe(false)
  })

  it('list に含まれる email は true', () => {
    process.env[KEY] = 'a@x.com,b@y.com'
    expect(isPlatformAdmin('a@x.com')).toBe(true)
    expect(isPlatformAdmin('b@y.com')).toBe(true)
  })

  it('list に含まれない email は false', () => {
    process.env[KEY] = 'a@x.com,b@y.com'
    expect(isPlatformAdmin('c@z.com')).toBe(false)
  })

  it('大文字小文字を無視して比較', () => {
    process.env[KEY] = 'Admin@Mocal.JP'
    expect(isPlatformAdmin('admin@mocal.jp')).toBe(true)
    expect(isPlatformAdmin('ADMIN@MOCAL.JP')).toBe(true)
  })

  it('カンマ周りの空白を許容', () => {
    process.env[KEY] = ' a@x.com , b@y.com ,c@z.com'
    expect(isPlatformAdmin('a@x.com')).toBe(true)
    expect(isPlatformAdmin('b@y.com')).toBe(true)
    expect(isPlatformAdmin('c@z.com')).toBe(true)
  })

  it('部分一致は false (a@x.com に matched@x.com を許可しない)', () => {
    process.env[KEY] = 'a@x.com'
    expect(isPlatformAdmin('matched-a@x.com')).toBe(false)
    expect(isPlatformAdmin('a@x.com.attacker.com')).toBe(false)
  })
})
