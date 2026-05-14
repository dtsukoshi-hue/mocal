'use client'

import { useState, useRef, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, MenuItem, Store } from '@/lib/database.types'
import Cart from './Cart'
import StoreStatusBanner from './StoreStatusBanner'

interface Props {
  store: Pick<Store, 'id' | 'name' | 'description' | 'is_open' | 'wait_minutes'>
  menuItems: Pick<MenuItem, 'id' | 'name' | 'description' | 'price' | 'category' | 'emoji' | 'is_available' | 'sort_order'>[]
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())

  // リアルタイムで店舗の受付状態・待ち時間を同期（StoreStatusBanner と共有）
  const [isOpen, setIsOpen] = useState(store.is_open)
  const [waitMinutes, setWaitMinutes] = useState(store.wait_minutes)

  useEffect(() => {
    const supabase = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const channel = supabase
      .channel(`store-status-menu-${store.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stores', filter: `id=eq.${store.id}` },
        (payload) => {
          if (typeof payload.new.is_open === 'boolean') setIsOpen(payload.new.is_open)
          if (typeof payload.new.wait_minutes === 'number') setWaitMinutes(payload.new.wait_minutes as typeof store.wait_minutes)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [store.id])

  const categories = [...new Set(menuItems.map(item => item.category ?? 'その他'))]
  const categoriesKey = categories.join('\0')

  // Intersection Observer でスクロール中のカテゴリーを追跡
  useEffect(() => {
    if (categories.length <= 1) return

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.getAttribute('data-category'))
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )

    sectionRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesKey])

  const scrollToCategory = (category: string) => {
    sectionRefs.current.get(category)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const MAX_QTY_PER_ITEM = 10
  const MAX_QTY_TOTAL = 30

  const addToCart = (item: Props['menuItems'][number]) => {
    setCart(prev => {
      const totalQty = prev.reduce((sum, c) => sum + c.qty, 0)
      if (totalQty >= MAX_QTY_TOTAL) return prev
      const existing = prev.find(c => c.menuItemId === item.id)
      if (existing) {
        if (existing.qty >= MAX_QTY_PER_ITEM) return prev
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
  const atCartMax = totalItems >= MAX_QTY_TOTAL

  if (showCart) {
    return (
      <Cart
        store={{ ...store, is_open: isOpen, wait_minutes: waitMinutes }}
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
          {store.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{store.description}</p>
          )}
          <StoreStatusBanner
            isOpen={isOpen}
            waitMinutes={waitMinutes}
          />
        </div>

        {/* カテゴリーナビ（2カテゴリー以上の場合のみ表示） */}
        {categories.length > 1 && (
          <div className="border-t border-gray-100 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 px-4 py-2 w-max">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => scrollToCategory(category)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCategory === category
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* メニューリスト */}
      <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
        {!isOpen && (
          <div className="rounded-xl bg-gray-100 text-gray-600 text-sm text-center py-6">
            現在、受付を停止しています
          </div>
        )}

        {categories.length === 0 && (
          <div className="rounded-xl bg-white shadow-sm text-gray-400 text-sm text-center py-16 space-y-2">
            <p className="text-3xl">🍽️</p>
            <p>現在メニューが登録されていません</p>
          </div>
        )}

        {categories.map(category => (
          <section
            key={category}
            data-category={category}
            ref={el => {
              if (el) sectionRefs.current.set(category, el)
              else sectionRefs.current.delete(category)
            }}
          >
            <h2 className="text-sm font-semibold text-gray-500 mb-3">{category}</h2>
            <div className="space-y-2">
              {menuItems
                .filter(item => (item.category ?? 'その他') === category)
                .map(item => (
                  <button
                    key={item.id}
                    onClick={() => isOpen && addToCart(item)}
                    disabled={!isOpen}
                    className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm text-left disabled:opacity-50 hover:bg-orange-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {item.emoji && (
                        <span className="text-2xl">{item.emoji}</span>
                      )}
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {item.name}
                        </span>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {cart.find(c => c.menuItemId === item.id) && (
                        <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {cart.find(c => c.menuItemId === item.id)?.qty}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-gray-900">
                        ¥{item.price.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </main>

      {/* カートボタン */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4">
          <div className="max-w-lg mx-auto space-y-2">
            {atCartMax && (
              <p className="text-xs text-center text-amber-700 bg-amber-50 rounded-xl py-1.5 px-3 border border-amber-200">
                カートの上限（{MAX_QTY_TOTAL}点）に達しました
              </p>
            )}
            <button
              onClick={() => setShowCart(true)}
              aria-label={`カートを確認する - ${totalItems}点, ¥${totalAmount.toLocaleString()}`}
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
