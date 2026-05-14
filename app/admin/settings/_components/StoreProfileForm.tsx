'use client'

import { useActionState, useState } from 'react'
import { updateStoreProfileAction } from '@/app/actions/store'

interface Props {
  name: string
  slug: string | null
  description: string | null
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

function validateSlug(value: string): string | null {
  if (!value) return 'スラッグは必須です'
  if (value.length < 3) return '3文字以上で入力してください'
  if (value.length > 50) return '50文字以内で入力してください'
  if (!SLUG_PATTERN.test(value)) return '英小文字・数字・ハイフンのみ使用可能です（先頭・末尾はハイフン不可）'
  return null
}

export default function StoreProfileForm({ name, slug, description }: Props) {
  const [state, formAction, isPending] = useActionState(updateStoreProfileAction, undefined)
  const [slugValue, setSlugValue] = useState(slug ?? '')
  const slugChanged = slugValue !== (slug ?? '') && slug !== null
  const slugError = slugValue !== (slug ?? '') ? validateSlug(slugValue) : null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (slugChanged && slugValue !== slug) {
      const ok = confirm(
        'URLを変更すると、配布済みの QR コードやリンクがすべて無効になります。\n本当に変更しますか？'
      )
      if (!ok) {
        e.preventDefault()
      }
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <p className="font-semibold text-gray-900">店舗情報</p>

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-green-600">保存しました</p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">店舗名</label>
        <input
          name="name"
          defaultValue={name}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL（スラッグ）</label>
        <div className={`flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500 ${
          slugError ? 'border-red-400' : slugValue && !slugError ? 'border-green-400' : 'border-gray-300'
        }`}>
          <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 shrink-0">
            mocal.jp/
          </span>
          <input
            name="slug"
            value={slugValue}
            onChange={e => setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            required
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
          />
          {slugValue && !slugError && (
            <span className="pr-3 text-green-500 text-sm">✓</span>
          )}
        </div>
        {slugError ? (
          <p className="text-xs text-red-500 mt-1">{slugError}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">変更するとこれまでの QR コードが使えなくなります</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">店舗説明（任意）</label>
        <textarea
          name="description"
          defaultValue={description ?? ''}
          placeholder="例：駅前の本格ラーメン店です。行列なしで事前注文できます。"
          rows={3}
          maxLength={200}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">200文字以内。メニューページ上部と検索結果に表示されます。</p>
      </div>

      <button
        type="submit"
        disabled={isPending || !!slugError}
        className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {isPending ? '保存中…' : '保存する'}
      </button>
    </form>
  )
}
