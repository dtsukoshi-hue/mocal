'use client'

import { useState } from 'react'
import type { MenuItem, Store } from '@/lib/database.types'
import Cart from './Cart'

export interface ComboInfo {
  id: string
  name: string
  description: string | null
  price_delta: number
  emoji: string | null
  is_available: boolean
  sort_order: number
  items: { menu_item_id: string; qty: number }[]
}

interface Props {
  store: Pick<Store, 'id' | 'name' | 'is_open' | 'wait_minutes'>
  menuItems: Pick<MenuItem, 'id' | 'name' | 'price' | 'description' | 'category' | 'emoji' | 'image_url' | 'is_available' | 'sort_order'>[]
  combos?: ComboInfo[]
}

export interface CartItem {
  menuItemId: string
  name: string
  price: number
  qty: number
  emoji: string | null
}

export default function MenuView({ store, menuItems, combos = [] }: Props) {
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

  // コンボを 1 件カートに追加（含まれるメニューを個別に展開）
  const addCombo = (combo: ComboInfo) => {
    setCart((prev) => {
      let next = [...prev]
      for (const ci of combo.items) {
        const item = menuItems.find((m) => m.id === ci.menu_item_id)
        if (!item || !item.is_available) continue
        const existing = next.find((c) => c.menuItemId === ci.menu_item_id)
        if (existing) {
          next = next.map((c) =>
            c.menuItemId === ci.menu_item_id ? { ...c, qty: c.qty + ci.qty } : c
          )
        } else {
          next.push({
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            qty: ci.qty,
            emoji: item.emoji,
          })
        }
      }
      return next
    })
  }

  if (showCart) {
    return (
      <Cart
        store={store}
        cart={cart}
        setCart={setCart}
        menuItems={menuItems}
        onBack={() => setShowCart(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">{store.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                store.is_open
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${store.is_open ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {store.is_open ? '受付中' : '受付停止中'}
            </span>
            {store.is_open && (
              <span className="text-xs text-gray-500">
                約{store.wait_minutes}分で受取
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

        {/* お得なセット */}
        {combos.length > 0 && combos.some((c) => c.is_available) && (
          <section>
            <h2 className="text-sm font-bold text-amber-800 mb-3 px-1">🎁 お得なセット</h2>
            <div className="space-y-2">
              {combos.filter((c) => c.is_available).map((combo) => {
                const baseSum = combo.items.reduce((s, ci) => {
                  const m = menuItems.find((x) => x.id === ci.menu_item_id)
                  return s + (m ? m.price * ci.qty : 0)
                }, 0)
                const totalPrice = baseSum + combo.price_delta
                return (
                  <button
                    key={combo.id}
                    onClick={() => store.is_open && addCombo(combo)}
                    disabled={!store.is_open}
                    className="w-full flex items-center justify-between bg-amber-50 rounded-xl px-3 py-3 shadow-sm text-left disabled:opacity-50 hover:bg-amber-100 transition-colors border border-amber-200"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {combo.emoji && (
                        <span className="text-2xl w-14 h-14 flex items-center justify-center bg-white rounded-lg shrink-0">
                          {combo.emoji}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-amber-900 truncate">{combo.name}</p>
                        {combo.description && (
                          <p className="text-xs text-amber-700/80 truncate mt-0.5">{combo.description}</p>
                        )}
                        {combo.price_delta !== 0 && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            {combo.price_delta < 0
                              ? `通常 ¥${baseSum.toLocaleString()} のところ ¥${Math.abs(combo.price_delta).toLocaleString()} お得`
                              : `+¥${combo.price_delta.toLocaleString()}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-amber-900 shrink-0 ml-2">
                      ¥{totalPrice.toLocaleString()}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {categories.map(category => (
          <section key={category}>
            <h2 className="text-sm font-bold text-gray-500 mb-3 px-1">{category}</h2>
            <div className="space-y-2">
              {menuItems
                .filter(item => (item.category ?? 'その他') === category)
                .map(item => (
                  <button
                    key={item.id}
                    onClick={() => store.is_open && addToCart(item)}
                    disabled={!store.is_open}
                    className="w-full flex items-center justify-between bg-white rounded-xl px-3 py-3 shadow-sm text-left disabled:opacity-50 hover:bg-amber-50 transition-colors border border-transparent hover:border-amber-200"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-16 h-16 rounded-lg object-cover bg-gray-100 shrink-0"
                          loading="lazy"
                        />
                      ) : item.emoji ? (
                        <span className="text-2xl w-16 h-16 flex items-center justify-center bg-gray-50 rounded-lg shrink-0">
                          {item.emoji}
                        </span>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
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
              className="w-full flex items-center justify-between bg-amber-700 hover:bg-amber-800 text-white rounded-2xl px-5 py-4 shadow-lg font-semibold transition-colors"
            >
              <span className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm">
                {totalItems}
              </span>
              <span>カートを見る</span>
              <span>¥{totalAmount.toLocaleString()}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
