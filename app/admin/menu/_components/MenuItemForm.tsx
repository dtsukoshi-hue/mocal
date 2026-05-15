'use client'

import { useActionState, useEffect } from 'react'
import { createMenuItemAction, updateMenuItemAction, type MenuActionState } from '@/app/actions/menu'
import type { MenuItem } from '@/lib/database.types'

interface Props {
  item?: MenuItem
  onClose: () => void
}

export default function MenuItemForm({ item, onClose }: Props) {
  const action = item ? updateMenuItemAction : createMenuItemAction
  const [state, formAction, isPending] = useActionState<MenuActionState, FormData>(action, undefined)

  useEffect(() => {
    if (state && 'success' in state) onClose()
  }, [state, onClose])

  return (
    <form action={formAction} className="space-y-4">
      {item && <input type="hidden" name="id" value={item.id} />}

      {state && 'error' in state && (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      )}

      <div>
        <label htmlFor="item-name" className="block text-sm font-medium text-gray-700 mb-1">商品名 *</label>
        <input
          id="item-name"
          name="name"
          defaultValue={item?.name}
          required
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="例：チーズバーガー"
        />
      </div>

      <div>
        <label htmlFor="item-price" className="block text-sm font-medium text-gray-700 mb-1">価格（円）*</label>
        <input
          id="item-price"
          name="price"
          type="number"
          defaultValue={item?.price}
          min={0}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="例：800"
        />
      </div>

      <div>
        <label htmlFor="item-category" className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
        <input
          id="item-category"
          name="category"
          defaultValue={item?.category ?? ''}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="例：バーガー"
        />
      </div>

      <div>
        <label htmlFor="item-emoji" className="block text-sm font-medium text-gray-700 mb-1">絵文字</label>
        <input
          id="item-emoji"
          name="emoji"
          defaultValue={item?.emoji ?? ''}
          maxLength={8}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="例：🍔"
        />
      </div>

      <div>
        <label htmlFor="item-description" className="block text-sm font-medium text-gray-700 mb-1">説明文</label>
        <textarea
          id="item-description"
          name="description"
          defaultValue={item?.description ?? ''}
          rows={2}
          maxLength={200}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          placeholder="例：ビーフパティ100g、チェダーチーズ、特製ソース"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
        >
          {isPending ? '保存中…' : item ? '更新する' : '追加する'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </form>
  )
}
