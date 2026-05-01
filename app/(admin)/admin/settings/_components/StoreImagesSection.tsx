'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Kind = 'logo' | 'cover'

interface Props {
  initialLogoUrl: string | null
  initialCoverUrl: string | null
}

export default function StoreImagesSection({ initialLogoUrl, initialCoverUrl }: Props) {
  const router = useRouter()
  const [logoUrl,  setLogoUrl]  = useState<string | null>(initialLogoUrl)
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<Kind | null>(null)

  async function handleUpload(kind: Kind, file: File) {
    setLoading(kind)
    setError(null)
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('file', file)
    const res = await fetch('/api/admin/store/images', { method: 'POST', body: fd })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'アップロードに失敗しました')
      setLoading(null)
      return
    }
    const data = await res.json() as { url: string }
    if (kind === 'logo') setLogoUrl(data.url)
    else                  setCoverUrl(data.url)
    setLoading(null)
    router.refresh()
  }

  async function handleDelete(kind: Kind) {
    if (!confirm('画像を削除しますか？')) return
    setLoading(kind)
    setError(null)
    const res = await fetch('/api/admin/store/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '削除に失敗しました')
      setLoading(null)
      return
    }
    if (kind === 'logo') setLogoUrl(null)
    else                  setCoverUrl(null)
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900">店舗画像</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          ロゴは店舗一覧、カバー画像は店舗ページのヘッダーに表示されます。
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
      )}

      {/* カバー画像 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          カバー画像（推奨 1200×400px）
        </label>
        {coverUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt="カバー画像"
              className="w-full h-40 object-cover rounded-xl bg-gray-100"
            />
            <button
              type="button"
              onClick={() => handleDelete('cover')}
              disabled={loading !== null}
              className="absolute top-2 right-2 bg-white/90 hover:bg-white text-red-600 text-xs font-semibold px-3 py-1 rounded-lg shadow disabled:opacity-50"
            >
              削除
            </button>
          </div>
        ) : (
          <div className="w-full h-40 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
            未設定
          </div>
        )}
        <FileButton
          label={coverUrl ? 'カバー画像を変更' : 'カバー画像をアップロード'}
          loading={loading === 'cover'}
          disabled={loading !== null}
          onChoose={(f) => handleUpload('cover', f)}
        />
      </div>

      {/* ロゴ */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          ロゴ画像（推奨 256×256px・正方形）
        </label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="ロゴ"
                className="w-20 h-20 object-cover rounded-xl bg-gray-100"
              />
              <button
                type="button"
                onClick={() => handleDelete('logo')}
                disabled={loading !== null}
                className="absolute -top-2 -right-2 bg-white/95 hover:bg-white text-red-600 text-[10px] font-semibold px-2 py-0.5 rounded-full shadow border border-gray-200 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
              未設定
            </div>
          )}
          <FileButton
            label={logoUrl ? 'ロゴを変更' : 'ロゴをアップロード'}
            loading={loading === 'logo'}
            disabled={loading !== null}
            onChoose={(f) => handleUpload('logo', f)}
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        対応形式: JPEG / PNG / WebP・最大 5MB
      </p>
    </div>
  )
}

function FileButton({
  label, loading, disabled, onChoose,
}: {
  label: string
  loading: boolean
  disabled: boolean
  onChoose: (file: File) => void
}) {
  return (
    <label className={`mt-3 inline-flex items-center justify-center text-sm font-semibold px-4 py-2 rounded-xl border transition-colors cursor-pointer ${
      disabled
        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
    }`}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onChoose(f)
          e.target.value = ''
        }}
      />
      {loading ? 'アップロード中...' : label}
    </label>
  )
}
