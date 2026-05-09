'use client'

import { useActionState, useState } from 'react'
import { registerStoreAction } from '@/app/actions/onboarding'
import Link from 'next/link'

export default function OnboardingPage() {
  const [state, formAction, isPending] = useActionState(registerStoreAction, undefined)
  const [slugValue, setSlugValue] = useState('')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">mocal に店舗を登録</h1>
          <p className="text-sm text-gray-500 mt-2">
            テイクアウト事前注文をはじめましょう
          </p>
        </div>

        <form action={formAction} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              店舗名 *
            </label>
            <input
              name="store_name"
              required
              placeholder="例：3000DAYS BURGER"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              店舗 URL（英小文字・数字・ハイフン）*
            </label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500">
              <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 shrink-0">
                mocal.jp/
              </span>
              <input
                name="slug"
                required
                value={slugValue}
                onChange={e => setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]"
                placeholder="3000days-burger"
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">QR コードに使われる URL です</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス *
            </label>
            <input
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード（8文字以上）*
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-50 transition-colors"
          >
            {isPending ? '登録中…' : '登録する'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          すでに登録済みの方は{' '}
          <Link href="/admin/login" className="text-orange-500 hover:underline">
            ログイン
          </Link>
        </p>

        <p className="text-center text-xs text-gray-400 mt-6">
          登録後、店舗設定ページから Stripe に接続することで決済を有効化できます。
        </p>
      </div>
    </div>
  )
}
