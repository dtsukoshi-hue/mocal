'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type MenuItem = {
  id: string
  name: string
  price: number
  emoji: string | null
  image_url: string | null
}

export type CategoryGroup = {
  /** DnD identity — category name (or '__uncategorized__' for un-tagged items) */
  id: string
  /** Human-readable label shown in the header */
  label: string
  items: MenuItem[]
}

interface Props {
  groups: CategoryGroup[]
  onDone: () => void
}

export default function CategoryReorderList({ groups: initial, onDone }: Props) {
  const router = useRouter()
  const [groups, setGroups] = useState<CategoryGroup[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setGroups((prev) => {
      const oldIndex = prev.findIndex((g) => g.id === String(active.id))
      const newIndex = prev.findIndex((g) => g.id === String(over.id))
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleItemDragEnd(groupId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        const oldIndex = g.items.findIndex((it) => it.id === String(active.id))
        const newIndex = g.items.findIndex((it) => it.id === String(over.id))
        if (oldIndex < 0 || newIndex < 0) return g
        return { ...g, items: arrayMove(g.items, oldIndex, newIndex) }
      })
    )
  }

  async function save() {
    setSaving(true)
    setError(null)
    // sort_order: catIdx * 10000 + (itemIdx + 1) * 10
    // This encodes both category order and item-within-category order in one integer.
    const payload = {
      items: groups.flatMap((g, catIdx) =>
        g.items.map((item, itemIdx) => ({
          id: item.id,
          sort_order: catIdx * 10000 + (itemIdx + 1) * 10,
        }))
      ),
    }
    const res = await fetch('/api/admin/menu/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '保存に失敗しました')
      setSaving(false)
      return
    }
    router.refresh()
    onDone()
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        ≡ アイコンをドラッグして並び替え。カテゴリごと、またはカテゴリ内の各メニューを移動できます。
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      {/* Outer DndContext — category-level sorting */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
      >
        <SortableContext
          items={groups.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {groups.map((group) => (
              <SortableCategory
                key={group.id}
                group={group}
                onItemDragEnd={(e) => handleItemDragEnd(group.id, e)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex gap-2 sticky bottom-4 bg-gray-50/95 pt-2">
        <button
          onClick={onDone}
          disabled={saving}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl"
        >
          キャンセル
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50"
        >
          {saving ? '保存中...' : '並び順を保存'}
        </button>
      </div>
    </div>
  )
}

// ─── Sortable category card ───────────────────────────────────────────────────

function SortableCategory({
  group,
  onItemDragEnd,
}: {
  group: CategoryGroup
  onItemDragEnd: (e: DragEndEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  // Each category card gets its own sensor instance for inner-item sorting.
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      {/* Category header — the ≡ handle drags the whole card */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50/60 border-b border-gray-100">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 text-xl leading-none cursor-grab active:cursor-grabbing touch-none select-none p-1 -ml-1 rounded"
          aria-label="カテゴリを並び替え"
        >
          ≡
        </button>
        <span className="text-sm font-bold text-gray-900 flex-1 select-none">
          {group.label}
        </span>
        <span className="text-xs text-gray-400 select-none">{group.items.length}品</span>
      </div>

      {/* Inner DndContext — item-level sorting within this category */}
      <DndContext
        sensors={itemSensors}
        collisionDetection={closestCenter}
        onDragEnd={onItemDragEnd}
      >
        <SortableContext
          items={group.items.map((it) => it.id)}
          strategy={verticalListSortingStrategy}
        >
          <div>
            {group.items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <div className="h-px bg-gray-100 mx-4" />}
                <SortableItemRow item={item} />
              </div>
            ))}
            {group.items.length === 0 && (
              <p className="text-xs text-gray-400 px-4 py-3">（メニューなし）</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ─── Sortable item row ────────────────────────────────────────────────────────

function SortableItemRow({ item }: { item: MenuItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 text-xl leading-none cursor-grab active:cursor-grabbing touch-none select-none p-1 -ml-1 rounded"
        aria-label="並び替え"
      >
        ≡
      </button>

      <div className="shrink-0">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            className="w-10 h-10 rounded-lg object-cover bg-gray-100"
            loading="lazy"
          />
        ) : item.emoji ? (
          <span className="text-xl w-10 h-10 flex items-center justify-center bg-gray-50 rounded-lg select-none">
            {item.emoji}
          </span>
        ) : (
          <span className="w-10 h-10 bg-gray-50 rounded-lg block" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate select-none">
          {item.name}
        </p>
        <p className="text-xs text-gray-500 select-none">
          ¥{item.price.toLocaleString()}
        </p>
      </div>
    </div>
  )
}
