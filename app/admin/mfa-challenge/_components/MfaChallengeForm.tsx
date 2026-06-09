'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

interface Props {
  factorId: string
}

/**
 * MFA TOTP code 入力フォーム。
 *
 * supabase.auth.mfa.challenge → verify を sequential 実行。
 * 成功で AAL2 達成 → /admin/dashboard へ navigate。
 */
export default function MfaChallengeForm({ factorId }: Props) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmed = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(trimmed)) {
      setError('6 桁の数字コードを入力してください。')
      return
    }

    setLoading(true)
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    try {
      const { data: challengeData, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId })
      if (challengeErr || !challengeData) {
        setError('認証に失敗しました。時間をおいて再度お試しください。')
        setLoading(false)
        return
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: trimmed,
      })

      if (verifyErr) {
        setError('コードが正しくありません。Authenticator アプリの表示を再確認してください。')
        setLoading(false)
        return
      }

      // AAL2 達成 → dashboard へ
      router.replace('/admin/dashboard')
      router.refresh()
    } catch {
      setError('予期しないエラーが発生しました。再度お試しください。')
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">mocal</h1>
          <p className="text-sm text-gray-500 mt-1">二段階認証</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-8 space-y-5">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Authenticator アプリに表示されている 6 桁のコードを入力してください。
            </p>
            <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700 mb-1">
              認証コード
            </label>
            <input
              id="totp-code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={7}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="000000"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 text-white font-semibold py-3 text-sm hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            {loading ? '確認中...' : '認証'}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
          >
            別のアカウントでログイン
          </button>
        </form>
      </div>
    </main>
  )
}
