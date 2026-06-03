import { describe, it, expect } from 'vitest'
import { isSlugReserved, getReservedSlugs } from '@/lib/slug-reservation'

describe('isSlugReserved', () => {
  it('app route slug は予約済', () => {
    expect(isSlugReserved('admin')).toBe(true)
    expect(isSlugReserved('api')).toBe(true)
    expect(isSlugReserved('auth')).toBe(true)
    expect(isSlugReserved('onboarding')).toBe(true)
    expect(isSlugReserved('tokushoho')).toBe(true)
    expect(isSlugReserved('privacy')).toBe(true)
    expect(isSlugReserved('inquiries')).toBe(true)
    expect(isSlugReserved('orders')).toBe(true)
  })

  it('一般 infrastructure slug は予約済', () => {
    expect(isSlugReserved('www')).toBe(true)
    expect(isSlugReserved('app')).toBe(true)
    expect(isSlugReserved('dashboard')).toBe(true)
    expect(isSlugReserved('blog')).toBe(true)
    expect(isSlugReserved('docs')).toBe(true)
    expect(isSlugReserved('login')).toBe(true)
    expect(isSlugReserved('signup')).toBe(true)
  })

  it('Next.js 内部 path slug は予約済', () => {
    expect(isSlugReserved('_next')).toBe(true)
    expect(isSlugReserved('_vercel')).toBe(true)
    expect(isSlugReserved('static')).toBe(true)
    expect(isSlugReserved('public')).toBe(true)
  })

  it('大文字混じりでも予約として判定 (case-insensitive)', () => {
    expect(isSlugReserved('Admin')).toBe(true)
    expect(isSlugReserved('ADMIN')).toBe(true)
    expect(isSlugReserved('AdMiN')).toBe(true)
  })

  it('前後の空白を trim して判定', () => {
    expect(isSlugReserved('  admin  ')).toBe(true)
    expect(isSlugReserved('\tapi\n')).toBe(true)
  })

  it('一般的な店舗 slug は予約されていない', () => {
    expect(isSlugReserved('mocal-cafe')).toBe(false)
    expect(isSlugReserved('shibuya-burger')).toBe(false)
    expect(isSlugReserved('3000days')).toBe(false)
    expect(isSlugReserved('a-very-long-store-name')).toBe(false)
    expect(isSlugReserved('store123')).toBe(false)
  })

  it('部分一致は予約しない (admin-cafe は OK)', () => {
    expect(isSlugReserved('admin-cafe')).toBe(false)
    expect(isSlugReserved('my-blog')).toBe(false)
    expect(isSlugReserved('api-store')).toBe(false)
  })

  it('空文字は予約として判定されない (slug regex で別途 reject される前提)', () => {
    expect(isSlugReserved('')).toBe(false)
    expect(isSlugReserved('   ')).toBe(false)
  })
})

describe('getReservedSlugs', () => {
  it('全予約語を read-only で取得できる', () => {
    const slugs = getReservedSlugs()
    expect(slugs.length).toBeGreaterThan(20)
    expect(slugs).toContain('admin')
    expect(slugs).toContain('api')
    expect(slugs).toContain('www')
  })
})
