'use client'

import { useState } from 'react'
import type { MenuItem, Store } from '@/lib/database.types'
import Cart from './Cart'

interface Props {
  store: Pick<Store, 'id' | 'name' | 'is_open' | 'wait_minutes'>
  menuItems: Pick<MenuItem, 'id' | 'name' | 'price' | 'category' | 'emoji' | 'is_available' | 'sort_order'>[]
}

export interface CartItem {
  menuItemId: string
  name: string
  price: number
  qty: number
  emoji: string | null
}

export default function MenuView({ store, menuItems }: Props) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  const categories = [...new Set(menuItems.map(item => item.category ?? 'その他'))]

  const addToCart = (item: Props['menuItems'][number]) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        return prev.map(c =>
          c.menuItemId === item.id ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [...prev, {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        qty: 1,
        emoji: item.emoji,
      }]
    })
  }

  const totalItems = cart.reduce((sum, c) => sum + c.qty, 0)
  const totalAmount = cart.reduce((sum, c) => sum + c.price * c.qty, 0)

  if (showCart) {
    return (
      <Cart
        store={store}
        cart={cart}
        setCart={setCart}
        onBack={() => setShowCart(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* ヘッダー */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">{store.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                store.is_open
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {store.is_open ? '受付中' : '受付停止中'}
            </span>
            {store.is_open && (
              <span className="text-xs text-gray-500">
                約{store.wait_minutes}分
              </span>
            )}
          </div>
        </div>
      </header>

      {/* メニューリスト */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {!store.is_open && (
          <div className="rounded-xl bg-gray-100 text-gray-600 text-sm text-center py-6">
            現在、受付を停止しています
          </div>
        )}

        {categories.map(category => (
          <section key={category}>
            <h2 className="text-sm font-semibold text-gray-500 mb-3">{category}</h2>
            <div className="space-y-2">
              {menuItems
                .filter(item => (item.category ?? 'その他') === category)
                .map(item => (
                  <button
                    key={item.id}
                    onClick={() => store.is_open && addToCart(item)}
                    disabled={!store.is_open}
                    className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm text-left disabled:opacity-50 hover:bg-orange-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {item.emoji && (
                        <span className="text-2xl">{item.emoji}</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 shrink-0 ml-2">
                      ¥{item.price.toLocaleString()}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </main>

      {/* カートボタン */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setShowCart(true)}
              className="w-full flex items-center justify-between bg-orange-500 text-white rounded-2xl px-5 py-4 shadow-lg font-semibold"
            >
              <span className="bg-orange-400 rounded-full w-6 h-6 flex items-center justify-center text-sm">
                {totalItems}
              </span>
              <span>カートを確認する</span>
              <span>¥{totalAmount.toLocaleString()}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
