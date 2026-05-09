'use client'

import { useState, useTransition } from 'react'
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

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <MenuItemForm item={item} onClose={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
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

      <span className="text-2xl w-8 text-center">{item.emoji ?? '🍽️'}</span>

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
          onClick={() => startTransition(() => toggleMenuItemAction(item.id, !item.is_available))}
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
          className="text-sm text-blue-600 hover:text-blue-700 px-2"
        >
          編集
        </button>

        <form action={deleteMenuItemAction.bind(null, item.id)}>
          <button
            type="submit"
            className="text-sm text-red-500 hover:text-red-600 px-2"
            onClick={e => {
              if (!confirm(`「${item.name}」を削除しますか？`)) e.preventDefault()
            }}
          >
            削除
          </button>
        </form>
      </div>
    </div>
  )
}
