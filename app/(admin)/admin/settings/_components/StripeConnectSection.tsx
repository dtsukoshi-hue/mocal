'use client'

import { useEffect, useState } from 'react'

interface ConnectStatus {
  connected: boolean
  accountId?: string
  detailsSubmitted?: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  error?: string
}

export default function StripeConnectSection() {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/admin/stripe/connect', { method: 'GET' })
      if (!res.ok) {
        setError('状態を取得できませんでした')
        return
      }
      const data = (await res.json()) as ConnectStatus
      setStatus(data)
    } catch {
      setError('ネットワークエラーが発生しました')
    }
  }

  useEffect(() => {
    // load() は async なので setState は await 後（マイクロタスク）に実行される。
    // 静的解析が同期実行と誤検知するため明示的に許可する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  async function startOnboarding() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: status?.connected ? 'update' : 'onboarding' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '登録の開始に失敗しました')
        setLoading(false)
        return
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch {
      setError('ネットワークエラーが発生しました')
      setLoading(false)
    }
  }

  // ステータス表示
  let badge: { label: string; color: string }
  if (!status) {
    badge = { label: '読み込み中...', color: 'bg-gray-100 text-gray-500' }
  } else if (!status.connected) {
    badge = { label: '未連携', color: 'bg-amber-100 text-amber-700' }
  } else if (status.chargesEnabled && status.payoutsEnabled) {
    badge = { label: '連携済み', color: 'bg-emerald-100 text-emerald-700' }
  } else if (status.detailsSubmitted) {
    badge = { label: '審査中', color: 'bg-blue-100 text-blue-700' }
  } else {
    badge = { label: '入力途中', color: 'bg-amber-100 text-amber-700' }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Stripe 連携</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            お客様のお支払いを直接受け取るために必要です
          </p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {status?.connected && (
        <div className="text-xs text-gray-500 space-y-1 pt-1">
          <div className="flex justify-between">
            <span>アカウント ID</span>
            <span className="font-mono">{status.accountId}</span>
          </div>
          <div className="flex justify-between">
            <span>決済の受付</span>
            <span className={status.chargesEnabled ? 'text-emerald-600' : 'text-gray-400'}>
              {status.chargesEnabled ? '有効' : '無効'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>振込</span>
            <span className={status.payoutsEnabled ? 'text-emerald-600' : 'text-gray-400'}>
              {status.payoutsEnabled ? '有効' : '無効'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
      )}

      <button
        type="button"
        onClick={startOnboarding}
        disabled={loading || !status}
        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 text-sm disabled:opacity-50 transition-colors"
      >
        {loading
          ? '準備中...'
          : status?.connected && !status.chargesEnabled
            ? '登録を続ける'
            : status?.connected
              ? 'Stripe ダッシュボードを編集'
              : 'Stripe で登録を開始'}
      </button>
    </div>
  )
}
