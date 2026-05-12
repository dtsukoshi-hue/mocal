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
  category: string | null
  emoji: string | null
  image_url: string | null
}

interface Props {
  items: MenuItem[]
  onDone: () => void
}

export default function ReorderList({ items: initial, onDone }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<MenuItem[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const isDirty = items.some((it, i) => it.id !== initial[i]?.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((it) => it.id === active.id)
      const newIndex = prev.findIndex((it) => it.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      items: items.map((it, i) => ({ id: it.id, sort_order: (i + 1) * 10 })),
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
        並び替えモード：項目をドラッグして順序を変更してください
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => <SortableRow key={item.id} item={item} />)}
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
          disabled={saving || !isDirty}
          className="flex-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold py-3 rounded-xl disabled:opacity-50"
        >
          {saving ? '保存中...' : '並び順を保存'}
        </button>
      </div>
    </div>
  )
}

function SortableRow({ item }: { item: MenuItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none touch-none"
    >
      <div className="text-gray-300 text-xl">≡</div>
      <div className="shrink-0">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            className="w-12 h-12 rounded-lg object-cover bg-gray-100"
            loading="lazy"
          />
        ) : item.emoji ? (
          <span className="text-2xl w-12 h-12 flex items-center justify-center bg-gray-50 rounded-lg">
            {item.emoji}
          </span>
        ) : (
          <span className="w-12 h-12 bg-gray-50 rounded-lg" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">
          {item.category ?? '未分類'} · ¥{item.price.toLocaleString()}
        </p>
      </div>
    </div>
  )
}
