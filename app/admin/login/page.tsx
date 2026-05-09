'use client'

import { useActionState, useState } from 'react'
import { loginAction, resetPasswordAction, type AuthState } from '@/app/actions/auth'
import Link from 'next/link'

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, undefined)
  const [resetState, resetAction, resetPending] = useActionState<AuthState, FormData>(resetPasswordAction, undefined)
  const [showReset, setShowReset] = useState(false)

  if (showReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">mocal</h1>
            <p className="text-sm text-gray-500 mt-1">パスワードをリセット</p>
          </div>

          {resetState && 'success' in resetState ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center space-y-4">
              <p className="text-4xl">📨</p>
              <p className="text-sm text-gray-700">
                メールを送信しました。<br />
                受信したリンクからパスワードを再設定してください。
              </p>
              <button
                onClick={() => setShowReset(false)}
                className="text-sm text-orange-500 hover:underline"
              >
                ログイン画面に戻る
              </button>
            </div>
          ) : (
            <form action={resetAction} className="bg-white rounded-2xl shadow p-8 space-y-5">
              <p className="text-sm text-gray-600">
                登録済みのメールアドレスを入力してください。パスワード再設定用のリンクを送信します。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メールアドレス
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {resetState && 'error' in resetState && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
                  {resetState.error}
                </p>
              )}
              <button
                type="submit"
                disabled={resetPending}
                className="w-full rounded-lg bg-orange-500 text-white font-semibold py-3 text-sm hover:bg-orange-600 disabled:opacity-60 transition-colors"
              >
                {resetPending ? '送信中...' : 'リセットメールを送信'}
              </button>
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                ← ログイン画面に戻る
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">mocal</h1>
          <p className="text-sm text-gray-500 mt-1">店舗管理画面</p>
        </div>

        <form action={action} className="bg-white rounded-2xl shadow p-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {state && 'error' in state && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-orange-500 text-white font-semibold py-3 text-sm hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button
            onClick={() => setShowReset(true)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            パスワードを忘れた方
          </button>
          <p className="text-sm text-gray-400">
            まだ登録していない方は{' '}
            <Link href="/onboarding" className="text-orange-500 hover:underline">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
