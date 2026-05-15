'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Supabase が hash fragment からセッションを復元する
  useEffect(() => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // セッション復元完了 — フォームを表示するためにここでは何もしない
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。')
      return
    }
    if (password !== confirm) {
      setError('パスワードが一致しません。')
      return
    }

    setLoading(true)
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError('パスワードの更新に失敗しました。もう一度やり直してください。')
      return
    }

    setDone(true)
    setTimeout(() => router.replace('/admin/dashboard'), 2000)
  }

  if (done) {
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <p className="text-4xl">✅</p>
          <p className="text-gray-700 font-medium">パスワードを更新しました</p>
          <p className="text-sm text-gray-400">ダッシュボードへ移動します...</p>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">mocal</h1>
          <p className="text-sm text-gray-500 mt-1">新しいパスワードを設定</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              新しいパスワード（8文字以上）
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード（確認）
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 text-white font-semibold py-3 text-sm hover:bg-orange-600 disabled:opacity-60 transition-colors"
          >
            {loading ? '更新中...' : 'パスワードを更新'}
          </button>
        </form>
      </div>
    </main>
  )
}
