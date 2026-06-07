'use client'

// nonce-based CSP（proxy.ts）が機能するよう動的レンダリングを強制
export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * パスワード再設定 page.
 *
 * email link は `/admin/reset-password?token_hash=...&type=recovery` で着地。
 * client-side で verifyOtp({type:'recovery', token_hash}) して session を確立、
 * その後 updateUser({password}) で新 password を保存。
 *
 * 注: 旧版は `{{ .ConfirmationURL }}` → hash fragment 経由で session 復元、
 *     PR-2 hotfix #62 で `/auth/confirm?type=recovery&...&next=/admin/reset-password`
 *     経路に変更したが、server-side verifyOtp の session が client-side updateUser
 *     と整合せず、永遠ループが発生 (実機 audit 2026-06-05 で発覚)。
 *     本 fix で email link を `/admin/reset-password?token_hash=...` 直接着地に戻し、
 *     page 内で verifyOtp + updateUser を sequential 実行する標準パターンへ。
 *
 * Suspense boundary: useSearchParams() を含む client component は Next.js 16
 * の static export build で Suspense 必須 (missing-suspense-with-csr-bailout)。
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    }>
      <ResetPasswordPageInner />
    </Suspense>
  )
}

function ResetPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // (A) Token hash 経路 (推奨、新 email template)
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    if (tokenHash && type === 'recovery') {
      ;(async () => {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        if (verifyErr) {
          setError('リンクの有効期限が切れているか、無効です。再度パスワード再設定をリクエストしてください。')
          setVerified(false)
        } else {
          setVerified(true)
        }
        setVerifying(false)
      })()
      return
    }

    // (B) Hash fragment 経路 (legacy / fallback)
    // Supabase が hash から session を auto-restore する場合 PASSWORD_RECOVERY event が来る
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setVerified(true)
        setVerifying(false)
      }
    })

    // (C) すでに session 確立済の場合 (e.g., /auth/confirm 経由) も verified 扱い
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setVerified(true)
        setVerifying(false)
      } else {
        // 3 秒待っても PASSWORD_RECOVERY event 来なければ link 無効と判定
        setTimeout(() => {
          setVerifying((v) => {
            if (v) setError('リンクが無効です。再度パスワード再設定をリクエストしてください。')
            return false
          })
        }, 3000)
      }
    })()

    return () => subscription.unsubscribe()
  }, [searchParams])

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
      setError('パスワードの更新に失敗しました。リンクの有効期限切れの可能性があります。再度パスワード再設定をリクエストしてください。')
      return
    }

    setDone(true)
    setTimeout(() => router.replace('/admin/dashboard'), 2000)
  }

  if (verifying) {
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-sm text-gray-500" aria-live="polite">確認中...</p>
      </main>
    )
  }

  if (done) {
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center space-y-3" aria-live="polite">
          <p className="text-4xl" aria-hidden="true">✅</p>
          <p className="text-gray-700 font-medium">パスワードを更新しました</p>
          <p className="text-sm text-gray-400">ダッシュボードへ移動します...</p>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">mocal</h1>
          <p className="text-sm text-gray-500 mt-1">新しいパスワードを設定</p>
        </div>

        {!verified && error && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-4">
            <p role="alert" className="text-sm text-red-600">{error}</p>
            <a href="/admin/login" className="inline-block text-sm text-amber-600 hover:underline font-medium">
              ログイン画面に戻る
            </a>
          </div>
        )}

        {verified && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-8 space-y-5">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                新しいパスワード（8文字以上）
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード（確認）
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-amber-600 text-white font-semibold py-3 text-sm hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {loading ? '更新中...' : 'パスワードを更新'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
