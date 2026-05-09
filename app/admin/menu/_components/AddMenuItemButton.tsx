'use client'

import { useState } from 'react'
import MenuItemForm from './MenuItemForm'

export default function AddMenuItemButton() {
  const [open, setOpen] = useState(false)

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
      onClick={() => setOpen(true)}
      className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
    >
      ＋ 商品を追加
    </button>
  )
}
