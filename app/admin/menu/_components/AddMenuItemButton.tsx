'use client'

import { useState, useRef, useEffect } from 'react'
import MenuItemForm from './MenuItemForm'

export default function AddMenuItemButton() {
  const [open, setOpen] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  // フォームを閉じたとき「商品を追加」ボタンにフォーカスを戻す
  useEffect(() => {
    if (wasOpen.current && !open) {
      addButtonRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  if (open) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">新しい商品を追加</h3>
        <MenuItemForm onClose={() => setOpen(false)} />
      </div>
    )
  }

  return (
    <button
      ref={addButtonRef}
      onClick={() => setOpen(true)}
      aria-expanded={open}
      className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
    >
      ＋ 商品を追加
    </button>
  )
}
