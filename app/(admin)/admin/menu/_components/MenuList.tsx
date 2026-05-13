'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReorderList from './ReorderList'

type MenuItem = {
  id: string
  name: string
  price: number
  description: string | null
  category: string | null
  emoji: string | null
  image_url: string | null
  is_available: boolean
  sort_order: number
}

type EditingItem = {
  name: string
  price: string
  description: string
  category: string
  emoji: string
}

const EMPTY_FORM: EditingItem = { name: '', price: '', description: '', category: '', emoji: '' }
const UNCATEGORIZED = '__uncategorized__'

export default function MenuList({ items }: { items: MenuItem[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingItem>(EMPTY_FORM)
  const [addForm, setAddForm] = useState<EditingItem>(EMPTY_FORM)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [reorderMode, setReorderMode] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      const c = item.category?.trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort()
  }, [items])

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>()
    for (const item of items) {
      const key = item.category?.trim() || UNCATEGORIZED
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === UNCATEGORIZED) return 1
      if (b === UNCATEGORIZED) return -1
      return a.localeCompare(b, 'ja')
    })
    return sortedKeys.map((k) => ({ category: k, items: map.get(k)! }))
  }, [items])

  async function toggleAvailable(item: MenuItem) {
    setLoading(item.id)
    setError(null)
    const res = await fetch(`/api/admin/menu/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: !item.is_available }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '更新に失敗しました')
    } else {
      router.refresh()
    }
    setLoading(null)
  }

  async function deleteItem(id: string) {
    setLoading(id)
    setError(null)
    setConfirmDeleteId(null)
    const res = await fetch(`/api/admin/menu/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '削除に失敗しました')
    } else {
      setEditingId(null)
      router.refresh()
    }
    setLoading(null)
  }

  async function uploadImage(id: string, file: File) {
    setLoading(`img-${id}`)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/admin/menu/${id}/image`, { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '画像のアップロードに失敗しました')
    } else {
      router.refresh()
    }
    setLoading(null)
  }

  async function removeImage(id: string) {
    setLoading(`img-${id}`)
    setError(null)
    setConfirmDeleteImageId(null)
    await fetch(`/api/admin/menu/${id}/image`, { method: 'DELETE' })
    router.refresh()
    setLoading(null)
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id)
    setConfirmDeleteId(null)
    setEditForm({
      name: item.name,
      price: String(item.price),
      description: item.description ?? '',
      category: item.category ?? '',
      emoji: item.emoji ?? '',
    })
    setError(null)
  }

  async function saveEdit(id: string) {
    const price = parseInt(editForm.price, 10)
    if (!editForm.name.trim()) return setError('名前は必須です')
    if (isNaN(price) || price < 0) return setError('価格が不正です')
    setLoading(id)
    setError(null)
    const res = await fetch(`/api/admin/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        price,
        description: editForm.description,
        category: editForm.category,
        emoji: editForm.emoji,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '更新に失敗しました')
      setLoading(null)
      return
    }
    setEditingId(null)
    router.refresh()
    setLoading(null)
  }

  async function addItem() {
    const price = parseInt(addForm.price, 10)
    if (!addForm.name.trim()) return setError('名前は必須です')
    if (isNaN(price) || price < 0) return setError('価格が不正です')
    setLoading('add')
    setError(null)
    const res = await fetch('/api/admin/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: addForm.name,
        price,
        description: addForm.description,
        category: addForm.category,
        emoji: addForm.emoji,
      }),
    })
    if (res.ok) {
      setAddForm(EMPTY_FORM)
      setShowAdd(false)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? '追加に失敗しました')
    }
    setLoading(null)
  }

  async function saveRename() {
    if (renamingCategory === null) return
    const from = renamingCategory === UNCATEGORIZED ? '' : renamingCategory
    const to = renameValue.trim()
    setLoading('rename')
    setError(null)
    const res = await fetch('/api/admin/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'カテゴリの変更に失敗しました')
      setLoading(null)
      return
    }
    setRenamingCategory(null)
    setRenameValue('')
    router.refresh()
    setLoading(null)
  }

  if (reorderMode) {
    return <ReorderList items={items} onDone={() => setReorderMode(false)} />
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* ツールバー */}
      <div className="flex gap-2">
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="flex-1 bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
        >
          ＋ メニューを追加
        </button>
        {items.length > 1 && (
          <button
            onClick={() => setReorderMode(true)}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            ↕ 並替
          </button>
        )}
      </div>

      {/* 新規追加フォーム */}
      {showAdd && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-bold text-gray-900">新規メニュー追加</p>
          </div>
          <div className="p-4 space-y-3">
            <ItemForm form={addForm} onChange={setAddForm} categories={categories} />
            <div className="flex gap-2 pt-1">
              <button
                onClick={addItem}
                disabled={loading === 'add'}
                className="flex-1 bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 transition-colors"
              >
                {loading === 'add' ? '追加中...' : '追加する'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(null) }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center text-gray-400 py-16 text-sm">
          <p className="text-3xl mb-3">🍽️</p>
          <p>メニューがまだありません</p>
        </div>
      )}

      {/* カテゴリカード */}
      {grouped.map((group) => (
        <section key={group.category}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* カテゴリヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-b border-gray-100">
              {renamingCategory === group.category ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="カテゴリ名（空で未分類に）"
                    maxLength={30}
                    autoFocus
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <button
                    onClick={saveRename}
                    disabled={loading === 'rename'}
                    className="text-xs bg-amber-700 hover:bg-amber-800 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => { setRenamingCategory(null); setError(null) }}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">
                      {group.category === UNCATEGORIZED ? '未分類' : group.category}
                    </h2>
                    <span className="text-xs text-gray-400 font-normal">{group.items.length}品</span>
                  </div>
                  <button
                    onClick={() => {
                      setRenamingCategory(group.category)
                      setRenameValue(group.category === UNCATEGORIZED ? '' : group.category)
                      setError(null)
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    カテゴリ名を変更
                  </button>
                </>
              )}
            </div>

            {/* アイテム行 */}
            {group.items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <div className="h-px bg-gray-100 mx-4" />}

                {editingId === item.id ? (
                  /* ── 編集フォーム（展開） ── */
                  <div className="p-4 space-y-3 bg-gray-50/30">
                    <ItemForm form={editForm} onChange={setEditForm} categories={categories} />

                    {/* 画像管理 */}
                    <div className="flex items-center gap-3 pt-1">
                      {item.image_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0" />
                          <div className="space-y-1">
                            <label className="block text-xs text-amber-700 hover:text-amber-800 cursor-pointer font-semibold">
                              画像を変更
                              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(item.id, f) }} />
                            </label>
                            {confirmDeleteImageId === item.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-600">削除しますか？</span>
                                <button onClick={() => removeImage(item.id)} className="text-xs text-red-600 font-bold hover:text-red-800">はい</button>
                                <button onClick={() => setConfirmDeleteImageId(null)} className="text-xs text-gray-400 hover:text-gray-600">戻る</button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDeleteImageId(item.id)} className="block text-xs text-red-400 hover:text-red-600">
                                画像を削除
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-colors">
                          <span>📷</span> 画像を追加
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(item.id, f) }} />
                        </label>
                      )}
                    </div>

                    {/* 保存・キャンセル・削除 */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveEdit(item.id)}
                        disabled={loading === item.id}
                        className="flex-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50 transition-colors"
                      >
                        {loading === item.id ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setConfirmDeleteId(null); setError(null) }}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                      >
                        キャンセル
                      </button>
                    </div>

                    {/* 削除 */}
                    {confirmDeleteId === item.id ? (
                      <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 space-y-2">
                        <p className="text-xs text-red-700 font-semibold">「{item.name}」を削除しますか？この操作は取り消せません。</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteItem(item.id)}
                            disabled={loading === item.id}
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            削除する
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 bg-white border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg transition-colors"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="w-full text-xs text-red-400 hover:text-red-600 py-1 transition-colors"
                      >
                        このメニューを削除する
                      </button>
                    )}
                  </div>
                ) : (
                  /* ── 通常行 ── */
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* テキスト情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                        <span className={`text-sm font-semibold truncate ${item.is_available ? 'text-gray-900' : 'text-gray-400'}`}>
                          {item.name}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                      )}
                      <p className={`text-xs mt-0.5 font-medium ${item.is_available ? 'text-gray-500' : 'text-gray-400'}`}>
                        ¥{item.price.toLocaleString()}
                      </p>
                    </div>

                    {/* iOS風トグル */}
                    <button
                      onClick={() => toggleAvailable(item)}
                      disabled={loading === item.id}
                      aria-label={item.is_available ? '販売中（タップで停止）' : '売り切れ（タップで再開）'}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
                        item.is_available ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        item.is_available ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>

                    {/* 編集バッジ */}
                    <button
                      onClick={() => startEdit(item)}
                      className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition-colors"
                    >
                      編集
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ItemForm({
  form,
  onChange,
  categories,
}: {
  form: EditingItem
  onChange: (f: EditingItem) => void
  categories: string[]
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="絵文字"
          value={form.emoji}
          onChange={(e) => onChange({ ...form, emoji: e.target.value })}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm w-20 text-center focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
          maxLength={2}
        />
        <input
          type="text"
          placeholder="メニュー名 *"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
        />
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">¥</span>
          <input
            type="number"
            placeholder="価格（税込）"
            value={form.price}
            onChange={(e) => onChange({ ...form, price: e.target.value })}
            className="border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
            min={0}
          />
        </div>
        <input
          type="text"
          placeholder="カテゴリ"
          list="menu-categories"
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
          maxLength={30}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
        />
        <datalist id="menu-categories">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      <textarea
        placeholder="説明文（任意・200文字以内）"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        maxLength={200}
        rows={2}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
      />
    </div>
  )
}
