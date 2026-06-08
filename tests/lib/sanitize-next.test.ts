/**
 * app/auth/confirm/route.ts sanitizeNext() の unit test。
 *
 * 監査 2026-06-08 #5: `/auth/confirm?next=https://evil.com` で外部 redirect が
 * 可能だった (open redirect + session fixation)。sanitizeNext で相対パス以外を
 * 拒否することで mitigate する。
 *
 * 攻撃ベクトル網羅:
 * - 絶対 URL (`https://evil.com`)
 * - protocol-relative URL (`//evil.com`)
 * - javascript: scheme
 * - data: scheme
 * - backslash 系 (一部ブラウザの historical bug)
 * - null / 空文字 / 不正値
 */

import { describe, it, expect } from 'vitest'
import { sanitizeNext } from '@/app/auth/confirm/route'

const DEFAULT_NEXT = '/admin/settings?welcome=1'

describe('sanitizeNext - 安全な値は保持', () => {
  it('通常の相対パスは通す', () => {
    expect(sanitizeNext('/admin/dashboard')).toBe('/admin/dashboard')
    expect(sanitizeNext('/admin/settings')).toBe('/admin/settings')
    expect(sanitizeNext('/orders/abc-123')).toBe('/orders/abc-123')
  })

  it('query string 付き相対パスは通す', () => {
    expect(sanitizeNext('/admin/settings?welcome=1')).toBe('/admin/settings?welcome=1')
    expect(sanitizeNext('/orders/123?from=email')).toBe('/orders/123?from=email')
  })

  it('hash 付き相対パスは通す', () => {
    expect(sanitizeNext('/admin/settings#push-notification')).toBe('/admin/settings#push-notification')
  })
})

describe('sanitizeNext - 攻撃ベクトルは DEFAULT_NEXT に fallback', () => {
  it('絶対 URL (https) を拒否', () => {
    expect(sanitizeNext('https://evil.com')).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('https://evil.com/phishing')).toBe(DEFAULT_NEXT)
  })

  it('絶対 URL (http) を拒否', () => {
    expect(sanitizeNext('http://evil.com')).toBe(DEFAULT_NEXT)
  })

  it('protocol-relative URL (//evil.com) を拒否', () => {
    expect(sanitizeNext('//evil.com')).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('//evil.com/phishing')).toBe(DEFAULT_NEXT)
  })

  it('javascript: scheme を拒否', () => {
    expect(sanitizeNext('javascript:alert(1)')).toBe(DEFAULT_NEXT)
  })

  it('data: scheme を拒否', () => {
    expect(sanitizeNext('data:text/html,<script>')).toBe(DEFAULT_NEXT)
  })

  it('backslash で始まる値を拒否 (一部ブラウザの historical bug 対策)', () => {
    expect(sanitizeNext('\\evil.com')).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('/\\evil.com')).toBe(DEFAULT_NEXT)
  })

  it('null / 空文字 / 不正な値は DEFAULT_NEXT', () => {
    expect(sanitizeNext(null)).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('')).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('admin/dashboard')).toBe(DEFAULT_NEXT) // / で始まらない
  })
})
