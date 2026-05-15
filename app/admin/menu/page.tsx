import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import Link from 'next/link'
import MenuItemCard from './_components/MenuItemCard'
import AddMenuItemButton from './_components/AddMenuItemButton'
import type { MenuItem } from '@/lib/database.types'

export const metadata: Metadata = { title: 'メニュー管理 | mocal' }

export default async function MenuPage() {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, description, price, category, emoji, is_available, sort_order, created_at')
    .eq('store_id', session.storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const grouped = (items ?? []).reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? '未分類'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item as MenuItem)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
            ← 注文管理
          </Link>
          <h1 className="text-lg font-bold text-gray-900">メニュー管理</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <AddMenuItemButton />

        {Object.entries(grouped).map(([category, categoryItems]) => (
          <section key={category}>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
              {category}
            </h2>
            <div className="space-y-2">
              {categoryItems.map((item, i) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  isFirst={i === 0}
                  isLast={i === categoryItems.length - 1}
                />
              ))}
            </div>
          </section>
        ))}

        {(!items || items.length === 0) && (
          <p className="text-center text-gray-400 py-12 text-sm">
            まだ商品が登録されていません
          </p>
        )}
      </main>
    </div>
  )
}
