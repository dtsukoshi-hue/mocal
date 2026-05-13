'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import CategoryReorderList, { type CategoryGroup } from './CategoryReorderList'

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

interface CsvRow {
  name: string
  price: number
  category: string
  description: string
  emoji: string
  /** row number for error display */
  _row: number
  /** validation error if any */
  _error?: string
}

const EMPTY_FORM: EditingItem = { name: '', price: '', description: '', category: '', emoji: '' }
const UNCATEGORIZED = '__uncategorized__'

// ─── Simple CSV parser (handles double-quoted fields) ─────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

const CSV_COLUMNS = ['カテゴリ', 'メニュー名', '価格', '説明文', '絵文字'] as const

function parseCSV(text: string): CsvRow[] {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (rawLines.length === 0) return []

  // Detect if first line is a header
  const firstCells = parseCSVLine(rawLines[0])
  const isHeader = firstCells.some((c) =>
    CSV_COLUMNS.some((col) => c.includes(col))
  )
  const dataLines = isHeader ? rawLines.slice(1) : rawLines

  return dataLines
    .map((line, idx) => {
      if (!line.trim()) return null
      const cells = parseCSVLine(line)
      // Support flexible column order if header detected;
      // otherwise assume: カテゴリ, メニュー名, 価格, 説明文, 絵文字
      const [category = '', name = '', priceStr = '', description = '', emoji = ''] = cells
      const price = parseInt(priceStr.replace(/[¥,￥\s]/g, ''), 10)
      const row: CsvRow = {
        name: name.trim(),
        price: isNaN(price) ? 0 : price,
        category: category.trim(),
        description: description.trim(),
        emoji: emoji.trim(),
        _row: idx + (isHeader ? 2 : 1),
      }
      if (!row.name) row._error = 'メニュー名が空です'
      else if (isNaN(price) || price < 0) row._error = '価格が不正です'
      else if (price > 999_999) row._error = '価格が上限を超えています'
      return row
    })
    .filter((r): r is CsvRow => r !== null)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MenuList({ items }: { items: MenuItem[] }) {
  const router = useRouter()

  // ── Core state
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Edit / Add state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditingItem>(EMPTY_FORM)
  const [addForm, setAddForm] = useState<EditingItem>(EMPTY_FORM)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState<string | null>(null)

  // ── Category rename state
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // ── Pending (new, not-yet-persisted) categories
  const [pendingCategories, setPendingCategories] = useState<string[]>([])
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // ── Reorder mode
  const [reorderMode, setReorderMode] = useState(false)

  // ── CSV import state
  const [showImport, setShowImport] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<number | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // ── Derived data
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      const c = item.category?.trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort()
  }, [items])

  const allCategories = useMemo(() => {
    const set = new Set([...categories])
    for (const pc of pendingCategories) set.add(pc)
    return Array.from(set).sort()
  }, [categories, pendingCategories])

  const grouped = useMemo(() => {
    // Build category groups preserving the sort_order from the server.
    // `items` is already sorted by sort_order, so insertion order equals
    // admin-defined order (catIdx * 10000 + itemIdx * 10 scheme).
    const map = new Map<string, MenuItem[]>()
    const orderedKeys: string[] = []
    for (const item of items) {
      const key = item.category?.trim() || UNCATEGORIZED
      if (!map.has(key)) {
        map.set(key, [])
        if (key !== UNCATEGORIZED) orderedKeys.push(key)
      }
      map.get(key)!.push(item)
    }
    // Pending (empty) categories appear after real ones
    for (const pc of pendingCategories) {
      if (!map.has(pc)) {
        map.set(pc, [])
        orderedKeys.push(pc)
      }
    }
    // Uncategorised items always go last
    if (map.has(UNCATEGORIZED)) orderedKeys.push(UNCATEGORIZED)
    return orderedKeys.map((k) => ({ category: k, items: map.get(k)! }))
  }, [items, pendingCategories])

  // ── Reorder mode: build CategoryGroup[] for CategoryReorderList
  const reorderGroups = useMemo<CategoryGroup[]>(() => {
    return grouped.map((g) => ({
      id: g.category,
      label: g.category === UNCATEGORIZED ? '未分類' : g.category,
      items: g.items,
    }))
  }, [grouped])

  // ─── Handlers ───────────────────────────────────────────────────────────────

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
      // If the added item belongs to a pending category, remove it from pending
      const addedCategory = addForm.category.trim()
      if (addedCategory) {
        setPendingCategories((prev) => prev.filter((pc) => pc !== addedCategory))
      }
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

  function addPendingCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    if (allCategories.includes(name)) {
      setNewCategoryName('')
      setAddingCategory(false)
      return
    }
    setPendingCategories((prev) => [...prev, name])
    setNewCategoryName('')
    setAddingCategory(false)
  }

  function removePendingCategory(name: string) {
    setPendingCategories((prev) => prev.filter((pc) => pc !== name))
  }

  // ── CSV import handlers
  function handleCsvFile(file: File) {
    setImportError(null)
    setImportSuccess(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') {
        setImportError('ファイルを読み込めませんでした')
        return
      }
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setImportError('データが見つかりませんでした')
        return
      }
      setCsvRows(rows)
    }
    reader.onerror = () => setImportError('ファイルを読み込めませんでした')
    reader.readAsText(file, 'UTF-8')
  }

  async function submitImport() {
    const validRows = csvRows.filter((r) => !r._error)
    if (validRows.length === 0) {
      setImportError('有効なデータがありません')
      return
    }
    setImportLoading(true)
    setImportError(null)
    const res = await fetch('/api/admin/menu/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: validRows.map((r) => ({
          name: r.name,
          price: r.price,
          category: r.category || undefined,
          description: r.description || undefined,
          emoji: r.emoji || undefined,
        })),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setImportError(data.error ?? 'インポートに失敗しました')
      setImportLoading(false)
      return
    }
    const data = await res.json()
    setImportSuccess(data.imported ?? validRows.length)
    setCsvRows([])
    if (csvInputRef.current) csvInputRef.current.value = ''
    router.refresh()
    setImportLoading(false)
  }

  // ─── Reorder mode ────────────────────────────────────────────────────────────

  if (reorderMode) {
    return (
      <CategoryReorderList
        groups={reorderGroups}
        onDone={() => setReorderMode(false)}
      />
    )
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  const hasErrors = csvRows.some((r) => r._error)

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* ── ツールバー */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="flex-1 min-w-[140px] bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
        >
          ＋ メニューを追加
        </button>
        <button
          onClick={() => setAddingCategory(true)}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          ＋ カテゴリ
        </button>
        {items.length > 1 && (
          <button
            onClick={() => setReorderMode(true)}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            ↕ 並替
          </button>
        )}
        <button
          onClick={() => { setShowImport((v) => !v); setImportError(null); setImportSuccess(null); setCsvRows([]) }}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          ↑ CSV
        </button>
      </div>

      {/* ── カテゴリ追加フォーム */}
      {addingCategory && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-700 mb-2">新しいカテゴリ名</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addPendingCategory() }}
              placeholder="例: ドリンク"
              maxLength={30}
              autoFocus
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              onClick={addPendingCategory}
              disabled={!newCategoryName.trim()}
              className="bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40 transition-colors"
            >
              追加
            </button>
            <button
              onClick={() => { setAddingCategory(false); setNewCategoryName('') }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── CSV インポートパネル */}
      {showImport && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">CSVインポート</p>
            <button
              onClick={() => { setShowImport(false); setCsvRows([]); setImportError(null); setImportSuccess(null) }}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              閉じる
            </button>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              1行目はヘッダー行として無視されます。列の順番:
              <span className="font-mono text-gray-700 ml-1">カテゴリ, メニュー名, 価格, 説明文, 絵文字</span>
            </p>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 transition-colors">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              CSVファイルを選択
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleCsvFile(f)
                }}
              />
            </label>

            {importError && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{importError}</p>
            )}
            {importSuccess !== null && (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-2.5">
                {importSuccess} 件のメニューをインポートしました
              </p>
            )}

            {csvRows.length > 0 && (
              <>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">行</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">カテゴリ</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">メニュー名</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">価格</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">説明文</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((row) => (
                          <tr
                            key={row._row}
                            className={`border-b border-gray-50 last:border-0 ${row._error ? 'bg-red-50' : ''}`}
                          >
                            <td className="px-3 py-2 text-gray-400">{row._row}</td>
                            <td className="px-3 py-2 text-gray-600">{row.category || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {row.emoji && <span className="mr-1">{row.emoji}</span>}
                              {row.name || <span className="text-red-500">（空）</span>}
                              {row._error && (
                                <span className="ml-2 text-red-500">⚠ {row._error}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {row._error ? '—' : `¥${row.price.toLocaleString()}`}
                            </td>
                            <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">
                              {row.description || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  {hasErrors && (
                    <p className="text-xs text-amber-700 flex-1">
                      ⚠ エラー行は除外してインポートします（{csvRows.filter((r) => r._error).length} 行スキップ）
                    </p>
                  )}
                  <button
                    onClick={submitImport}
                    disabled={importLoading || csvRows.filter((r) => !r._error).length === 0}
                    className="ml-auto bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold px-6 py-2.5 rounded-xl disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {importLoading
                      ? 'インポート中...'
                      : `${csvRows.filter((r) => !r._error).length} 件をインポート`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 新規追加フォーム */}
      {showAdd && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-bold text-gray-900">新規メニュー追加</p>
          </div>
          <div className="p-4 space-y-3">
            <ItemForm form={addForm} onChange={setAddForm} categories={allCategories} />
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

      {items.length === 0 && pendingCategories.length === 0 && (
        <div className="text-center text-gray-400 py-16 text-sm">
          <p className="text-3xl mb-3">🍽️</p>
          <p>メニューがまだありません</p>
        </div>
      )}

      {/* ── カテゴリカード */}
      {grouped.map((group) => {
        const isPending = group.items.length === 0 && pendingCategories.includes(group.category)
        return (
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
                    <div className="flex items-center gap-3">
                      {/* Quick-add into this category */}
                      <button
                        onClick={() => {
                          setAddForm({ ...EMPTY_FORM, category: group.category === UNCATEGORIZED ? '' : group.category })
                          setShowAdd(true)
                          setError(null)
                        }}
                        className="text-xs text-amber-700 hover:text-amber-900 font-semibold transition-colors"
                      >
                        ＋ 追加
                      </button>
                      {!isPending && group.category !== UNCATEGORIZED ? (
                        <button
                          onClick={() => {
                            setRenamingCategory(group.category)
                            setRenameValue(group.category)
                            setError(null)
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          名前を変更
                        </button>
                      ) : isPending ? (
                        <button
                          onClick={() => removePendingCategory(group.category)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors"
                        >
                          削除
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              {/* アイテム行 */}
              {group.items.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-xs text-gray-400">まだメニューがありません</p>
                </div>
              ) : (
                group.items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <div className="h-px bg-gray-100 mx-4" />}

                    {editingId === item.id ? (
                      /* ── 編集フォーム（展開） ── */
                      <div className="p-4 space-y-3 bg-gray-50/30">
                        <ItemForm form={editForm} onChange={setEditForm} categories={allCategories} />

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

                        {/* 保存・キャンセル */}
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
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ─── Item form ────────────────────────────────────────────────────────────────

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
