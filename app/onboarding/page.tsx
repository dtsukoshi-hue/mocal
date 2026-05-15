'use client'

// nonce-based CSP（proxy.ts）が機能するよう動的レンダリングを強制
export const dynamic = 'force-dynamic'

import { useActionState, useState } from 'react'
import { registerStoreAction } from '@/app/actions/onboarding'
import Link from 'next/link'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

export default function OnboardingPage() {
  const [state, formAction, isPending] = useActionState(registerStoreAction, undefined)
  const [slugValue, setSlugValue] = useState('')

  const slugValid = SLUG_RE.test(slugValue)
  const slugTouched = slugValue.length > 0
  const slugError = slugTouched && !slugValid
    ? slugValue.length < 3
      ? '3文字以上で入力してください'
      : '英小文字・数字・ハイフンのみ使用できます（先頭と末尾は英数字）'
    : null

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <span className="text-2xl font-bold text-gray-900">mo<span className="text-orange-500">cal</span></span>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">店舗を登録する</h1>
          <p className="text-sm text-gray-500 mt-1">
            テイクアウト事前注文をはじめましょう
          </p>
        </div>

        <form action={formAction} className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          {state?.error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* 店舗名 */}
          <div>
            <label htmlFor="store-name" className="block text-sm font-medium text-gray-700 mb-1">
              店舗名 <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="store-name"
              name="store_name"
              required
              placeholder="例：3000DAYS BURGER"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* 店舗 URL */}
          <div>
            <label htmlFor="store-slug" className="block text-sm font-medium text-gray-700 mb-1">
              店舗 URL <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <div className={`flex items-center border rounded-lg overflow-hidden focus-within:ring-2 transition-colors ${
              slugError
                ? 'border-red-400 focus-within:ring-red-300'
                : slugTouched && slugValid
                  ? 'border-green-400 focus-within:ring-green-300'
                  : 'border-gray-300 focus-within:ring-orange-500'
            }`}>
              <span className="px-3 py-2.5 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 shrink-0 select-none" aria-hidden="true">
                mocal.jp/
              </span>
              <input
                id="store-slug"
                name="slug"
                required
                value={slugValue}
                onChange={e => setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]"
                title="英小文字・数字・ハイフンのみ、先頭と末尾は英数字、3文字以上"
                placeholder="3000days-burger"
                aria-describedby={slugError ? 'slug-error' : 'slug-hint'}
                aria-invalid={slugError ? true : undefined}
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-white"
              />
              {slugTouched && (
                <span className="pr-3 text-sm" aria-hidden="true">
                  {slugValid ? '✅' : '❌'}
                </span>
              )}
            </div>
            {slugError ? (
              <p id="slug-error" role="alert" className="text-xs text-red-500 mt-1">{slugError}</p>
            ) : (
              <p id="slug-hint" className="text-xs text-gray-400 mt-1">QR コードに使われる URL です（変更するとQRコードが無効になります）</p>
            )}
          </div>

          {/* メールアドレス */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* パスワード */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8文字以上"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">8文字以上で設定してください</p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? '登録中…' : '無料で登録する'}
          </button>

          <p className="text-xs text-center text-gray-400 leading-relaxed">
            登録後、店舗設定から Stripe に接続することで決済機能が有効になります。
          </p>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          すでに登録済みの方は{' '}
          <Link href="/admin/login" className="text-orange-500 hover:underline font-medium">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  )
}
