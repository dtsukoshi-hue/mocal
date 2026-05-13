'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  waitMinutes: number
  overrideUntil?: string | null
}

const WAIT_OPTIONS = [
  { label: '10〜20分', min: 10, sub: '早め' },
  { label: '15〜30分', min: 15, sub: '通常' },
  { label: '20〜35分', min: 20, sub: 'やや混雑' },
  { label: '30〜45分', min: 30, sub: '混雑中' },
  { label: '40〜60分', min: 40, sub: 'かなり混雑' },
  { label: '60分以上', min: 60, sub: 'お時間要' },
]

function waitLabel(min: number) {
  return WAIT_OPTIONS.find((o) => o.min === min)?.label ?? `${min}分`
}

export default function StoreToggle({
  isOpen,
  waitMinutes: initialWait,
  overrideUntil: initialOverride,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(isOpen)
  const [waitMinutes, setWaitMinutes] = useState(initialWait)
  const [overrideUntil, setOverrideUntil] = useState<string | null>(initialOverride ?? null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Sheet state: null | 'action' | 'time'
  const [sheet, setSheet] = useState<'action' | 'time' | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)

  const [mountedAt] = useState(() => Date.now())
  const overrideActive =
    overrideUntil !== null && new Date(overrideUntil).getTime() > mountedAt

  // Animate sheet open/close
  useEffect(() => {
    if (sheet !== null) {
      // Tick after mount so CSS transition fires
      const id = requestAnimationFrame(() => setSheetVisible(true))
      return () => cancelAnimationFrame(id)
    } else {
      setSheetVisible(false)
    }
  }, [sheet])

  function openSheet() {
    setErrorMessage(null)
    setSheet('action')
  }

  function closeSheet() {
    setSheetVisible(false)
    setTimeout(() => setSheet(null), 300)
  }

  function openTimeSheet() {
    setSheet('time')
    // sheetVisible stays true — we just swap content
  }

  function backToAction() {
    setSheet('action')
  }

  async function doToggle() {
    const next = !optimistic
    setOptimistic(next)
    closeSheet()

    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_open: next }),
    })

    if (!res.ok) {
      setOptimistic(!next)
      setErrorMessage('更新に失敗しました。もう一度お試しください。')
      return
    }
    const json = await res.json().catch(() => ({}))
    if (json?.manual_override_until) {
      setOverrideUntil(json.manual_override_until)
    }
    startTransition(() => router.refresh())
  }

  async function doChangeWait(min: number) {
    setWaitMinutes(min)
    closeSheet()

    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wait_minutes: min }),
    })
    if (!res.ok) {
      setWaitMinutes(waitMinutes)
      setErrorMessage('受取時間の更新に失敗しました')
      return
    }
    startTransition(() => router.refresh())
  }

  async function clearOverride() {
    const prev = overrideUntil
    setOverrideUntil(null)
    const res = await fetch('/api/admin/store', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear_override: true }),
    })
    if (!res.ok) {
      setOverrideUntil(prev)
      setErrorMessage('解除に失敗しました')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <>
      {/* ── トグルボタン（ヘッダー右に表示） */}
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={openSheet}
          disabled={isPending}
          className={`inline-flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded-full transition-all disabled:opacity-50 ${
            optimistic
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              optimistic ? 'bg-white/50 animate-pulse' : 'bg-gray-500'
            }`}
          />
          {optimistic ? '受付中' : '受付停止中'}
        </button>

        {overrideActive && (
          <button
            type="button"
            onClick={clearOverride}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
          >
            <svg
              className="w-3 h-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
            自動制御オフ中
            <span className="underline underline-offset-2">· 解除する</span>
          </button>
        )}

        {errorMessage && (
          <p className="text-[10px] text-red-500 text-right">{errorMessage}</p>
        )}
      </div>

      {/* ── アクションシート（受付設定 / 受取時間変更） */}
      {sheet !== null && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeSheet}
            className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${
              sheetVisible ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden
          />

          {/* Sheet */}
          <div
            className={`fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg bg-white rounded-t-3xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              sheetVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={sheet === 'action' ? '受付設定' : '予定受取時間を変更'}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {sheet === 'action' ? (
              <ActionSheetContent
                isOpen={optimistic}
                waitMinutes={waitMinutes}
                onToggle={doToggle}
                onOpenTime={openTimeSheet}
                onClose={closeSheet}
              />
            ) : (
              <TimeSheetContent
                currentMin={waitMinutes}
                onSelect={doChangeWait}
                onBack={backToAction}
                onClose={closeSheet}
              />
            )}
          </div>
        </>
      )}
    </>
  )
}

// ─── 受付設定シート ────────────────────────────────────────────────────────────

function ActionSheetContent({
  isOpen,
  waitMinutes,
  onToggle,
  onOpenTime,
  onClose,
}: {
  isOpen: boolean
  waitMinutes: number
  onToggle: () => void
  onOpenTime: () => void
  onClose: () => void
}) {
  return (
    <div className="px-4 pb-8 pt-1 space-y-2.5">
      <p className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-widest py-1">
        {isOpen ? '受付設定' : '受付停止中'}
      </p>

      {isOpen ? (
        <>
          {/* 受取時間変更 */}
          <SheetButton
            onClick={onOpenTime}
            variant="gold"
            label="⏱ 予定受取時間を変更する"
            sub={`現在: ${waitLabel(waitMinutes)}`}
          />
          {/* 受付停止 */}
          <SheetButton
            onClick={onToggle}
            variant="red"
            label="⏸ 受付を停止する"
            sub="新規注文を一時停止"
          />
        </>
      ) : (
        /* 受付再開 */
        <SheetButton
          onClick={onToggle}
          variant="green"
          label="✅ 受付を再開する"
          sub="新規注文の受付を開始"
        />
      )}

      <SheetButton onClick={onClose} variant="cancel" label="キャンセル" />
    </div>
  )
}

// ─── 受取時間変更シート ────────────────────────────────────────────────────────

function TimeSheetContent({
  currentMin,
  onSelect,
  onBack,
  onClose,
}: {
  currentMin: number
  onSelect: (min: number) => void
  onBack: () => void
  onClose: () => void
}) {
  return (
    <div className="px-4 pb-8 pt-1">
      <p className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-widest py-1 mb-3">
        予定受取時間を変更
      </p>
      <p className="text-center text-xs text-gray-500 mb-4">
        新規注文に表示する受取目安時間を選んでください
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {WAIT_OPTIONS.map((opt) => {
          const selected = opt.min === currentMin
          return (
            <button
              key={opt.min}
              onClick={() => onSelect(opt.min)}
              className={`rounded-2xl border py-3 px-2 text-center transition-all active:scale-95 ${
                selected
                  ? 'bg-amber-600 border-amber-600 text-white'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-amber-400'
              }`}
            >
              <div className="text-sm font-bold leading-tight">{opt.label}</div>
              <div
                className={`text-[10px] mt-0.5 ${
                  selected ? 'text-white/70' : 'text-gray-400'
                }`}
              >
                {opt.sub}
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onBack}
        className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
      >
        ← 戻る
      </button>
      <SheetButton onClick={onClose} variant="cancel" label="キャンセル" />
    </div>
  )
}

// ─── SheetButton ──────────────────────────────────────────────────────────────

type SheetVariant = 'gold' | 'red' | 'green' | 'cancel'

const VARIANT_CLASSES: Record<SheetVariant, string> = {
  gold:   'bg-amber-50 border border-amber-200 text-amber-700',
  red:    'bg-red-50 border border-red-200 text-red-600',
  green:  'bg-emerald-50 border border-emerald-200 text-emerald-700',
  cancel: 'bg-gray-100 text-gray-500 mt-1',
}

function SheetButton({
  onClick,
  variant,
  label,
  sub,
}: {
  onClick: () => void
  variant: SheetVariant
  label: string
  sub?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full min-h-[56px] rounded-2xl font-bold text-[15px] flex items-center justify-between px-5 transition-all active:scale-[0.97] ${VARIANT_CLASSES[variant]}`}
    >
      <span>{label}</span>
      {sub && (
        <span className="text-xs font-medium opacity-60">{sub}</span>
      )}
    </button>
  )
}
