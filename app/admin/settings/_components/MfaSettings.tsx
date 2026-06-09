'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

type Status = 'loading' | 'not_enrolled' | 'enrolling' | 'enrolled'

/**
 * 二段階認証 (TOTP) の enroll / 解除 UI。
 *
 * Stripe 申告書 §1「取得されたアカウントを不正使用されないよう二段階認証
 * または二要素認証を採用する」要件のために実装 (2026-06-08)。
 *
 * フロー:
 * - not_enrolled: 「有効化する」 button → mfa.enroll() → QR code + secret 表示 →
 *   enrolling 状態で 6 桁 verify → 成功で enrolled
 * - enrolled: 「無効化する」 button → confirm → mfa.unenroll()
 *
 * 注意: factor が verified になった次の login から MFA challenge が必須化される。
 * 現在の session には影響しない (logout / 再 login まで AAL1 のまま動く)。
 */
export default function MfaSettings() {
  const [status, setStatus] = useState<Status>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setStatus('not_enrolled')
      return
    }
    // data.totp は verified factor のみ。unverified は data.all で確認。
    const verified = data.totp[0]
    if (verified) {
      setStatus('enrolled')
      setFactorId(verified.id)
    } else {
      // 前回 enrollment 中断で残った unverified factor を掃除
      const unverified = data.all.find((f) => f.factor_type === 'totp' && f.status === 'unverified')
      if (unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id })
      }
      setStatus('not_enrolled')
    }
  }

  const handleEnroll = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `mocal admin (${new Date().toISOString().slice(0, 10)})`,
      })
      if (error || !data) {
        setMessage({ type: 'err', text: '有効化に失敗しました。時間をおいて再度お試しください。' })
        setLoading(false)
        return
      }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStatus('enrolling')
    } catch {
      setMessage({ type: 'err', text: '予期しないエラーが発生しました。' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    const trimmed = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(trimmed)) {
      setMessage({ type: 'err', text: '6 桁の数字コードを入力してください。' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const { data: challengeData, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId })
      if (challengeErr || !challengeData) {
        setMessage({ type: 'err', text: '確認に失敗しました。' })
        setLoading(false)
        return
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: trimmed,
      })
      if (verifyErr) {
        setMessage({ type: 'err', text: 'コードが正しくありません。Authenticator の表示を確認してください。' })
        setLoading(false)
        return
      }
      setMessage({ type: 'ok', text: '二段階認証を有効化しました。次回ログインから認証コードが必要になります。' })
      setQrCode(null)
      setSecret(null)
      setCode('')
      await refresh()
    } catch {
      setMessage({ type: 'err', text: '予期しないエラーが発生しました。' })
    } finally {
      setLoading(false)
    }
  }

  const handleUnenroll = async () => {
    if (!factorId) return
    if (!confirm('二段階認証を無効化します。よろしいですか?\n(セキュリティ要件のため再有効化を推奨します)')) {
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) {
        setMessage({ type: 'err', text: '無効化に失敗しました。' })
        setLoading(false)
        return
      }
      setMessage({ type: 'ok', text: '二段階認証を無効化しました。' })
      await refresh()
    } catch {
      setMessage({ type: 'err', text: '予期しないエラーが発生しました。' })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEnrollment = async () => {
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId })
    }
    setStatus('not_enrolled')
    setFactorId(null)
    setQrCode(null)
    setSecret(null)
    setCode('')
    setMessage(null)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
      <div>
        <p className="font-semibold text-gray-900">二段階認証 (TOTP)</p>
        <p className="text-sm text-gray-500 mt-0.5">
          パスワードに加えて Authenticator アプリの 6 桁コードでログインを保護します。
          <strong className="text-gray-700">セキュリティ要件のため有効化を推奨します。</strong>
        </p>
      </div>

      {status === 'loading' && (
        <p className="text-xs text-gray-400">確認中...</p>
      )}

      {status === 'not_enrolled' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <p><span aria-hidden="true">⚠️</span> <strong>現在 二段階認証は無効です</strong></p>
            <p>有効化すると Google Authenticator / 1Password / Authy 等で生成される 6 桁コードがログイン時に必要になります。</p>
          </div>
          <button
            type="button"
            onClick={handleEnroll}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
          >
            {loading ? '設定中…' : '二段階認証を有効化する'}
          </button>
        </div>
      )}

      {status === 'enrolling' && qrCode && secret && (
        <div className="space-y-4">
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">手順:</p>
            <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
              <li>Authenticator アプリ (Google Authenticator / 1Password / Authy 等) を開く</li>
              <li>下の QR コードをスキャン (またはシークレットを手入力)</li>
              <li>アプリに表示される 6 桁コードを下に入力</li>
            </ol>

            <div className="flex flex-col items-center gap-3 py-2">
              {/* Supabase が返す qr_code は SVG 文字列 */}
              <div
                className="bg-white p-3 rounded border border-stone-200"
                style={{ width: 200, height: 200 }}
                dangerouslySetInnerHTML={{ __html: qrCode }}
              />
              <details className="w-full">
                <summary className="text-xs text-gray-500 cursor-pointer">QR が読めない場合: シークレットを手入力</summary>
                <p className="font-mono text-xs bg-white border border-stone-200 rounded px-2 py-1.5 mt-2 break-all select-all">
                  {secret}
                </p>
              </details>
            </div>
          </div>

          <form onSubmit={handleVerify} className="space-y-3">
            <label htmlFor="enroll-code" className="block text-sm font-medium text-gray-700">
              アプリに表示された 6 桁コード
            </label>
            <input
              id="enroll-code"
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
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 text-sm transition-colors disabled:opacity-60"
              >
                {loading ? '確認中…' : '有効化を完了'}
              </button>
              <button
                type="button"
                onClick={handleCancelEnrollment}
                disabled={loading}
                className="text-sm text-gray-500 hover:text-gray-700 underline px-2"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {status === 'enrolled' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 inline-flex items-center gap-2">
            <span aria-hidden="true">✓</span> 二段階認証が有効です
          </div>
          <button
            type="button"
            onClick={handleUnenroll}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-red-700 underline disabled:opacity-60"
          >
            無効化する
          </button>
        </div>
      )}

      {message && (
        <p
          role={message.type === 'err' ? 'alert' : 'status'}
          className={`text-xs ${message.type === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
