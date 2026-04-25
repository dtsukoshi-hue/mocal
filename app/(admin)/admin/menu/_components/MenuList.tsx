'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type MenuItem = {
  id: string
  name: string
  price: number
  category: string | null
  emoji: string | null
  is_available: boolean
  sort_order: number
}

type EditingItem = {
  name: string
  price: string
  category: string
  emoji: string
}

const EMPTY_FORM = { name: '', price: '', category: '', emoji: '' }

export default function MenuList({ items }: { items: MenuItem[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingItem>(EMPTY_FORM)
  const [addForm, setAddForm] = useState<EditingItem>(EMPTY_FORM)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleAvailable(item: MenuItem) {
    setLoading(item.id)
    await fetch(`/api/admin/menu/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: !item.is_available }),
    })
    router.refresh()
    setLoading(null)
  }

  async function deleteItem(id: string) {
    if (!confirm('削除しますか？')) return
    setLoading(id)
    await fetch(`/api/admin/menu/${id}`, { method: 'DELETE' })
    router.refresh()
    setLoading(null)
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id)
    setEditForm({
      name: item.name,
      price: String(item.price),
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
    await fetch(`/api/admin/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        price,
        category: editForm.category,
        emoji: editForm.emoji,
      }),
    })
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {/* 追加フォーム */}
      {showAdd ? (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <p className="font-semibold text-gray-900">新規メニュー追加</p>
          <ItemForm form={addForm} onChange={setAddForm} />
          <div className="flex gap-2">
            <button
              onClick={addItem}
              disabled={loading === 'add'}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
            >
              {loading === 'add' ? '追加中...' : '追加する'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(null) }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-3 rounded-xl"
        >
          ＋ メニューを追加
        </button>
      )}

      {/* メニュー一覧 */}
      {items.length === 0 && (
        <div className="text-center text-gray-400 py-12 text-sm">メニューがありません</div>
      )}

      {items.map(item => (
        <div key={item.id} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          {editingId === item.id ? (
            <>
              <ItemForm form={editForm} onChange={setEditForm} />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(item.id)}
                  disabled={loading === item.id}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
                >
                  {loading === item.id ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => { setEditingId(null); setError(null) }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2 rounded-lg"
                >
                  キャンセル
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.emoji && <span className="text-xl">{item.emoji}</span>}
                  <div>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                  </div>
                </div>
                <span className="font-semibold text-gray-900">¥{item.price.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleAvailable(item)}
                  disabled={loading === item.id}
                  className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 ${
                    item.is_available
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {item.is_available ? '提供中' : '提供停止中'}
                </button>
                <button
                  onClick={() => startEdit(item)}
                  className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-semibold py-2 rounded-lg"
                >
                  編集
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  disabled={loading === item.id}
                  className="flex-1 bg-red-50 text-red-500 hover:bg-red-100 text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function ItemForm({
  form,
  onChange,
}: {
  form: EditingItem
  onChange: (f: EditingItem) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="絵文字"
          value={form.emoji}
          onChange={e => onChange({ ...form, emoji: e.target.value })}
          className="border rounded-lg px-3 py-2 text-sm w-20"
          maxLength={2}
        />
        <input
          type="text"
          placeholder="メニュー名 *"
          value={form.name}
          onChange={e => onChange({ ...form, name: e.target.value })}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="価格（円） *"
          value={form.price}
          onChange={e => onChange({ ...form, price: e.target.value })}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
          min={0}
        />
        <input
          type="text"
          placeholder="カテゴリ"
          value={form.category}
          onChange={e => onChange({ ...form, category: e.target.value })}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>
    </div>
  )
}
