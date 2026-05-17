'use client'

// Root layout 自体が壊れた場合の最終フォールバック。
// このファイルは独自の <html> と <body> を返さなければならない。

import { useEffect } from 'react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'global error boundary',
      digest: error.digest,
      message: error.message,
    }))
  }, [error])

  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', background: '#f9fafb', minHeight: '100vh' }}>
        <div style={{ maxWidth: '420px', margin: '64px auto', background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
            エラーが発生しました
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
            時間をおいて再度お試しください。
          </p>
          {error.digest && (
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
              エラーID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{ padding: '12px 24px', borderRadius: '12px', background: '#111827', color: 'white', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  )
}
