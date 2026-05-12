'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface MenuItemLite {
  id: string
  name: string
  price: number
  emoji: string | null
}

interface ComboItem {
  menu_item_id: string
  qty: number
}

interface Combo {
  id: string
  name: string
  description: string | null
  price_delta: number
  emoji: string | null
  is_available: boolean
  sort_order: number
  items: ComboItem[]
}

interface DraftCombo {
  name: string
  description: string
  price_delta: string
  emoji: string
  items: ComboItem[]
}

const EMPTY_DRAFT: DraftCombo = { name: '', description: '', price_delta: '0', emoji: '', items: [] }

interface Props {
  menuItems: MenuItemLite[]
}

export default function CombosManager({ menuItems }: Props) {
  const router = useRouter()
  const [combos, setCombos] = useState<Combo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftCombo>(EMPTY_DRAFT)
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState<DraftCombo>(EMPTY_DRAFT)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/combos')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCombos(data.combos ?? [])
      })
      .catch(() => { if (!cancelled) setCombos([]) })
    return () => { cancelled = true }
  }, [])

  function startEdit(c: Combo) {
    setEditingId(c.id)
    setEditDraft({
      name: c.name,
      description: c.description ?? '',
      price_delta: String(c.price_delta),
      emoji: c.emoji ?? '',
      items: c.items.map((i) => ({ menu_item_id: i.menu_item_id, qty: i.qty })),
    })
    setError(null)
  }

  type BuildResult =
    | { ok: true; payload: { name: string; description: string | null; price_delta: number; emoji: string | null; items: ComboItem[] } }
    | { ok: false; error: string }

  function buildPayload(d: DraftCombo): BuildResult {
    const priceDelta = parseInt(d.price_delta, 10)
    if (!d.name.trim()) return { ok: false, error: 'セット名は必須です' }
    if (isNaN(priceDelta)) return { ok: false, error: '価格差分が不正です' }
    if (d.items.length === 0) return { ok: false, error: '少なくとも 1 つのメニューを含めてください' }
    return {
      ok: true,
      payload: {
        name: d.name.trim(),
        description: d.description.trim() || null,
        price_delta: priceDelta,
        emoji: d.emoji.trim() || null,
        items: d.items,
      },
    }
  }

  async function saveAdd() {
    const r = buildPayload(addDraft)
    if (!r.ok) { setError(r.error); return }
    setLoading('add')
    setError(null)
    const res = await fetch('/api/admin/combos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '作成に失敗しました')
      setLoading(null)
      return
    }
    setShowAdd(false)
    setAddDraft(EMPTY_DRAFT)
    setLoading(null)
    await reload()
    router.refresh()
  }

  async function saveEdit(id: string) {
    const r = buildPayload(editDraft)
    if ('error' in r) { setError(r.error); return }
    setLoading(id)
    setError(null)
    const res = await fetch(`/api/admin/combos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '保存に失敗しました')
      setLoading(null)
      return
    }
    setEditingId(null)
    setLoading(null)
    await reload()
    router.refresh()
  }

  async function toggleAvailable(c: Combo) {
    setLoading(c.id)
    setError(null)
    const res = await fetch(`/api/admin/combos/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: !c.is_available }),
    })
    setLoading(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '更新に失敗しました')
      return
    }
    await reload()
    router.refresh()
  }

  async function deleteCombo(id: string) {
    if (!confirm('このセットを削除しますか？')) return
    setLoading(id)
    setError(null)
    const res = await fetch(`/api/admin/combos/${id}`, { method: 'DELETE' })
    setLoading(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '削除に失敗しました')
      return
    }
    await reload()
    router.refresh()
  }

  async function reload() {
    const r = await fetch('/api/admin/combos').then((x) => x.json()).catch(() => ({}))
    setCombos(r.combos ?? [])
  }

  if (combos === null) {
    return <p className="text-sm text-gray-400 py-6 text-center">読み込み中...</p>
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {/* 追加フォーム */}
      {showAdd ? (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-amber-200">
          <p className="font-semibold text-gray-900">🎁 新規セットを追加</p>
          <ComboForm draft={addDraft} onChange={setAddDraft} menuItems={menuItems} />
          <div className="flex gap-2">
            <button
              onClick={saveAdd}
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
          className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-sm font-semibold py-3 rounded-xl"
        >
          ＋ お得なセットを追加
        </button>
      )}

      {combos.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          まだセットが登録されていません
        </p>
      ) : (
        combos.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            {editingId === c.id ? (
              <>
                <ComboForm draft={editDraft} onChange={setEditDraft} menuItems={menuItems} />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(c.id)}
                    disabled={loading === c.id}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
                  >
                    {loading === c.id ? '保存中...' : '保存'}
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
              <ComboRow
                combo={c}
                menuItems={menuItems}
                isLoading={loading === c.id}
                onEdit={() => startEdit(c)}
                onToggle={() => toggleAvailable(c)}
                onDelete={() => deleteCombo(c.id)}
              />
            )}
          </div>
        ))
      )}
    </div>
  )
}

function ComboRow({
  combo, menuItems, isLoading, onEdit, onToggle, onDelete,
}: {
  combo: Combo
  menuItems: MenuItemLite[]
  isLoading: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const baseSum = combo.items.reduce((s, ci) => {
    const m = menuItems.find((x) => x.id === ci.menu_item_id)
    return s + (m ? m.price * ci.qty : 0)
  }, 0)
  const total = baseSum + combo.price_delta

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {combo.emoji && <span className="text-base">{combo.emoji}</span>}
          <p className="font-semibold text-gray-900 truncate">{combo.name}</p>
        </div>
        <p className="text-sm font-bold text-gray-900 shrink-0">¥{total.toLocaleString()}</p>
      </div>
      {combo.description && (
        <p className="text-xs text-gray-500">{combo.description}</p>
      )}
      <div className="text-xs text-gray-500 space-y-0.5">
        {combo.items.map((ci) => {
          const m = menuItems.find((x) => x.id === ci.menu_item_id)
          return (
            <div key={ci.menu_item_id} className="flex justify-between">
              <span>・{m?.name ?? '(削除されたメニュー)'} × {ci.qty}</span>
              <span className="text-gray-400">¥{((m?.price ?? 0) * ci.qty).toLocaleString()}</span>
            </div>
          )
        })}
        <div className="flex justify-between border-t border-gray-100 pt-1 mt-1 text-gray-600">
          <span>セット価格差分</span>
          <span className={combo.price_delta < 0 ? 'text-emerald-600 font-semibold' : 'text-gray-700'}>
            {combo.price_delta >= 0 ? '+' : ''}¥{combo.price_delta.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onToggle}
          disabled={isLoading}
          className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 ${
            combo.is_available
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {combo.is_available ? '提供中' : '提供停止中'}
        </button>
        <button
          onClick={onEdit}
          className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-semibold py-2 rounded-lg"
        >
          編集
        </button>
        <button
          onClick={onDelete}
          disabled={isLoading}
          className="flex-1 bg-red-50 text-red-500 hover:bg-red-100 text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          削除
        </button>
      </div>
    </>
  )
}

function ComboForm({
  draft, onChange, menuItems,
}: {
  draft: DraftCombo
  onChange: (d: DraftCombo) => void
  menuItems: MenuItemLite[]
}) {
  // 含まれるアイテムの合計
  const baseSum = useMemo(
    () => draft.items.reduce((s, ci) => {
      const m = menuItems.find((x) => x.id === ci.menu_item_id)
      return s + (m ? m.price * ci.qty : 0)
    }, 0),
    [draft.items, menuItems]
  )
  const priceDeltaNum = parseInt(draft.price_delta, 10) || 0
  const total = baseSum + priceDeltaNum

  function setItemQty(menuItemId: string, qty: number) {
    if (qty <= 0) {
      onChange({ ...draft, items: draft.items.filter((i) => i.menu_item_id !== menuItemId) })
      return
    }
    if (draft.items.find((i) => i.menu_item_id === menuItemId)) {
      onChange({
        ...draft,
        items: draft.items.map((i) => i.menu_item_id === menuItemId ? { ...i, qty } : i),
      })
    } else {
      onChange({ ...draft, items: [...draft.items, { menu_item_id: menuItemId, qty }] })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="🎁"
          value={draft.emoji}
          onChange={(e) => onChange({ ...draft, emoji: e.target.value })}
          maxLength={2}
          className="border rounded-lg px-3 py-2 text-sm w-20"
        />
        <input
          type="text"
          placeholder="セット名 *（例: ポテトセット）"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          maxLength={60}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>
      <input
        type="text"
        placeholder="説明（任意）"
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        maxLength={200}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">価格差分</span>
        <input
          type="number"
          placeholder="-100"
          value={draft.price_delta}
          onChange={(e) => onChange({ ...draft, price_delta: e.target.value })}
          step={10}
          className="border rounded-lg px-3 py-2 text-sm w-32"
        />
        <span className="text-[10px] text-gray-400">負の値で割引、正の値で追加料金</span>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500">含めるメニュー</p>
        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
          {menuItems.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-3">メニューがありません</p>
          ) : (
            menuItems.map((m) => {
              const inCombo = draft.items.find((i) => i.menu_item_id === m.id)
              const qty = inCombo?.qty ?? 0
              return (
                <div key={m.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {m.emoji && <span>{m.emoji}</span>}
                    <span className="text-sm truncate">{m.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">¥{m.price.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setItemQty(m.id, qty - 1)}
                      disabled={qty === 0}
                      aria-label={`${m.name} を 1 つ減らす`}
                      className="w-6 h-6 rounded-full border text-gray-600 flex items-center justify-center disabled:opacity-30"
                    >−</button>
                    <span className={`text-sm font-semibold w-4 text-center ${qty > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setItemQty(m.id, qty + 1)}
                      aria-label={`${m.name} を 1 つ追加`}
                      className="w-6 h-6 rounded-full border text-gray-600 flex items-center justify-center"
                    >＋</button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-0.5">
        <div className="flex justify-between text-gray-600">
          <span>含まれる商品の合計</span>
          <span>¥{baseSum.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>価格差分</span>
          <span className={priceDeltaNum < 0 ? 'text-emerald-600 font-semibold' : ''}>
            {priceDeltaNum >= 0 ? '+' : ''}¥{priceDeltaNum.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1 mt-1">
          <span>セット価格</span>
          <span>¥{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
