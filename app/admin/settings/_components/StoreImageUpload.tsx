'use client'

import { useRef, useState, useTransition, useCallback } from 'react'

interface Props {
  type: 'logo' | 'cover'
  currentUrl: string | null
  label: string
  hint?: string
  aspectClass?: string   // Tailwind クラス例: 'aspect-square' | 'aspect-video'
}

export default function StoreImageUpload({
  type,
  currentUrl,
  label,
  hint,
  aspectClass = 'aspect-video',
}: Props) {
  const [url, setUrl] = useState<string | null>(currentUrl)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // クライアントサイドバリデーション（ラウンドトリップを防止）
    if (file.size > 5 * 1024 * 1024) {
      setError('ファイルサイズは 5MB 以下にしてください。')
      e.target.value = ''
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      setError('JPEG・PNG・WebP・GIF 形式のみアップロードできます。')
      e.target.value = ''
      return
    }

    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('type', type)

      const res = await fetch('/api/admin/store/image', { method: 'POST', body: formData })
      const json = await res.json() as { url?: string; error?: string }

      // 同じファイルを再選択できるよう input をリセット
      if (inputRef.current) inputRef.current.value = ''

      if (!res.ok || json.error) {
        setError(json.error ?? 'アップロードに失敗しました。')
        return
      }
      if (json.url) setUrl(json.url)
    })
  }

  const handleDelete = useCallback(async () => {
    setError(null)
    setConfirmingDelete(false)
    setIsDeleting(true)
    try {
      const res = await fetch('/api/admin/store/image', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || json.error) {
        setError(json.error ?? '削除に失敗しました。')
      } else {
        setUrl(null)
      }
    } catch {
      setError('削除に失敗しました。')
    } finally {
      setIsDeleting(false)
    }
  }, [type])

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}

      {/* プレビュー */}
      <div
        className={`${aspectClass} w-full max-w-xs bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            未設定
          </div>
        )}
        {isPending && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">{error}</p>
      )}

      {/* ファイル選択ボタン */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label={`${label}の画像を選択`}
        className="sr-only"
        onChange={handleChange}
        disabled={isPending || isDeleting}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending || isDeleting}
          className="text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50 font-medium"
        >
          {isPending ? 'アップロード中…' : url ? '画像を変更' : '画像をアップロード'}
        </button>
        {url && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending || isDeleting}
            className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
          >
            {isDeleting ? '削除中…' : '削除'}
          </button>
        )}
        {url && confirmingDelete && (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">削除しますか？</span>
            <button
              type="button"
              onClick={handleDelete}
              className="text-red-600 font-medium hover:text-red-700"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              キャンセル
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
