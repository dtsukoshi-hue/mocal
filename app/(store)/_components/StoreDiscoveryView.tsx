'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

interface StoreEntry {
  id: string
  name: string
  is_open: boolean | null
  wait_minutes: number | null
  area: string | null
  cuisine_type: string | null
  logo_url: string | null
}

interface Props {
  stores: StoreEntry[]
}

const ALL = '__all__'

export default function StoreDiscoveryView({ stores }: Props) {
  const [query, setQuery] = useState('')
  const [activeArea, setActiveArea] = useState<string>(ALL)
  const [activeCuisine, setActiveCuisine] = useState<string>(ALL)

  // 重複除去したエリア・ジャンル一覧
  const areas = useMemo(() => {
    const set = new Set<string>()
    for (const s of stores) {
      if (s.area && s.area.trim() !== '') set.add(s.area.trim())
    }
    return Array.from(set).sort()
  }, [stores])

  const cuisines = useMemo(() => {
    const set = new Set<string>()
    for (const s of stores) {
      if (s.cuisine_type && s.cuisine_type.trim() !== '') set.add(s.cuisine_type.trim())
    }
    return Array.from(set).sort()
  }, [stores])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return stores.filter((s) => {
      if (activeArea !== ALL && s.area !== activeArea) return false
      if (activeCuisine !== ALL && s.cuisine_type !== activeCuisine) return false
      if (q) {
        const name = s.name.toLowerCase()
        const cuisine = (s.cuisine_type ?? '').toLowerCase()
        if (!name.includes(q) && !cuisine.includes(q)) return false
      }
      return true
    })
  }, [stores, query, activeArea, activeCuisine])

  const heading = useMemo(() => {
    if (activeArea !== ALL) return `${activeArea}エリア`
    return '店舗一覧'
  }, [activeArea])

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
            placeholder="店舗名・ジャンルで探す"
            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* エリア絞り込み */}
        {areas.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 overflow-x-auto">
            <div className="flex gap-1.5 max-w-lg mx-auto">
              <Chip active={activeArea === ALL} onClick={() => setActiveArea(ALL)}>
                すべてのエリア
              </Chip>
              {areas.map((a) => (
                <Chip key={a} active={activeArea === a} onClick={() => setActiveArea(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* ジャンル絞り込み */}
        {cuisines.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 overflow-x-auto">
            <div className="flex gap-1.5 max-w-lg mx-auto">
              <Chip active={activeCuisine === ALL} onClick={() => setActiveCuisine(ALL)}>
                すべて
              </Chip>
              {cuisines.map((c) => (
                <Chip key={c} active={activeCuisine === c} onClick={() => setActiveCuisine(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-2">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1 pt-2">
          {query ? '検索結果' : heading}
        </h2>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-400 shadow-sm">
            {query || activeArea !== ALL || activeCuisine !== ALL
              ? '該当する店舗がありません'
              : '現在表示できる店舗がありません'}
          </div>
        ) : (
          filtered.map((store) => (
            <Link
              key={store.id}
              href={`/${store.id}`}
              className="block bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 hover:bg-amber-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                {store.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.logo_url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900 truncate">{store.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {store.cuisine_type ?? 'お店'}
                    {store.area && <> · {store.area}</>}
                  </p>
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

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
      }`}
    >
      {children}
    </button>
  )
}
