'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface StoreEntry {
  id: string
  name: string
  is_open: boolean | null
  wait_minutes: number | null
}

interface Props {
  stores: StoreEntry[]
}

// プロトタイプではエリアやジャンルでフィルタしているが、現状の DB には
// エリア・ジャンル・距離が無いため検索のみ提供（拡張時にカテゴリ追加予定）
export default function StoreDiscoveryView({ stores }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => s.name.toLowerCase().includes(q))
  }, [stores, query])

  return (
    <>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              <span className="text-amber-700">m</span>ocal
            </h1>
            <p className="text-xs text-gray-500">テイクアウト事前注文</p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="店舗名で探す"
            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-2">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 pt-2">
          {query ? '検索結果' : '店舗一覧'}
        </h2>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-400 shadow-sm">
            {query ? '該当する店舗がありません' : '現在表示できる店舗がありません'}
          </div>
        ) : (
          filtered.map((store) => (
            <Link
              key={store.id}
              href={`/${store.id}`}
              className="block bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 hover:bg-amber-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{store.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        store.is_open
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${store.is_open ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {store.is_open ? '受付中' : '受付停止中'}
                    </span>
                    {store.is_open && store.wait_minutes && (
                      <span className="text-xs text-gray-500">
                        約{store.wait_minutes}分
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300 text-xl">›</span>
              </div>
            </Link>
          ))
        )}

        <div className="pt-6 text-center">
          <Link
            href="/admin/login"
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            店舗管理者ログイン
          </Link>
        </div>
      </main>
    </>
  )
}
