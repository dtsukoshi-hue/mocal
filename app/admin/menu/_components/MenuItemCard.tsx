'use client'

import { useRef, useState, useTransition } from 'react'
import { toggleMenuItemAction, deleteMenuItemAction, moveMenuItemAction } from '@/app/actions/menu'
import MenuItemForm from './MenuItemForm'
import type { MenuItem } from '@/lib/database.types'

interface Props {
  item: MenuItem
  isFirst: boolean
  isLast: boolean
}

export default function MenuItemCard({ item, isFirst, isLast }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(item.image_url)
  const [imageUploading, setImageUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // クライアントサイドバリデーション
    if (file.size > 5 * 1024 * 1024) {
      setError('ファイルサイズは 5MB 以下にしてください。')
      e.target.value = ''
      return
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('JPEG・PNG・WebP 形式のみアップロードできます。')
      e.target.value = ''
      return
    }

    setError(null)
    setImageUploading(true)
    const fd = new FormData()
    fd.set('file', file)
    fd.set('menuItemId', item.id)
    try {
      const res = await fetch('/api/admin/menu/image', { method: 'POST', body: fd })
      const json = await res.json() as { url?: string; error?: string }
      if (!res.ok || json.error) {
        setError(json.error ?? '画像のアップロードに失敗しました。')
      } else if (json.url) {
        setImageUrl(json.url)
      }
    } catch {
      setError('画像のアップロードに失敗しました。')
    } finally {
      setImageUploading(false)
      // 同じファイルを再選択できるよう input をリセット
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <MenuItemForm item={item} onClose={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      {error && (
        <p className="text-xs text-red-600 mb-2" role="alert">{error}</p>
      )}
      <div className="flex items-center gap-3">
        {/* 並び替えボタン */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <form action={moveMenuItemAction.bind(null, item.id, 'up')}>
            <button
              type="submit"
              disabled={isFirst}
              aria-label={`${item.name}を上に移動`}
              className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1"
            >
              ▲
            </button>
          </form>
          <form action={moveMenuItemAction.bind(null, item.id, 'down')}>
            <button
              type="submit"
              disabled={isLast}
              aria-label={`${item.name}を下に移動`}
              className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1"
            >
              ▼
            </button>
          </form>
        </div>

        {/* 商品画像またはアイコン */}
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading}
          aria-label={`${item.name}の画像をアップロード`}
          className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-gray-100 bg-gray-50 flex items-center justify-center text-2xl hover:ring-2 hover:ring-orange-400 transition-all disabled:opacity-50"
        >
          {imageUploading ? (
            <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden="true">{item.emoji ?? '🍽️'}</span>
          )}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={`${item.name}の画像ファイルを選択`}
          className="sr-only"
          onChange={handleImageChange}
        />

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{item.name}</p>
          {item.description && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
          )}
          <p className="text-sm text-gray-500">
            ¥{item.price.toLocaleString()}
            {item.category && <span className="ml-2 text-xs text-gray-400">{item.category}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await toggleMenuItemAction(item.id, !item.is_available)
                if (result?.error) setError(result.error)
              })
            }}
            disabled={isPending}
            role="switch"
            aria-checked={item.is_available}
            aria-label={item.is_available ? '販売を停止する' : '販売を開始する'}
            className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-60 ${
              item.is_available
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {item.is_available ? '販売中' : '停止中'}
          </button>

          <button
            onClick={() => setEditing(true)}
            aria-label={`${item.name}を編集`}
            className="text-sm text-blue-600 hover:text-blue-700 px-2"
          >
            編集
          </button>

          <button
            disabled={isPending}
            onClick={() => {
              if (!confirm(`「${item.name}」を削除しますか？`)) return
              setError(null)
              startTransition(async () => {
                const result = await deleteMenuItemAction(item.id)
                if (result?.error) setError(result.error)
              })
            }}
            aria-label={`${item.name}を削除`}
            className="text-sm text-red-500 hover:text-red-600 px-2 disabled:opacity-50"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  )
}
