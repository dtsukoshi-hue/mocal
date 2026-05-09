'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface Props {
  storeId: string
  initialPaidCount?: number
}

// 新規注文到着時の効果音（Web Audio API）
function playNewOrderSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // AudioContext が使えない環境では無視
  }
}

export default function RealtimeDashboard({ storeId, initialPaidCount = 0 }: Props) {
  const router = useRouter()
  const prevStatusRef = useRef<Record<string, string>>({})
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ブラウザタブにバッジ表示
  useEffect(() => {
    document.title = initialPaidCount > 0 ? `(${initialPaidCount}) 注文管理 | mocal` : '注文管理 | mocal'
    return () => { document.title = '注文管理 | mocal' }
  }, [initialPaidCount])

  // router.refresh() をデバウンス（複数の Realtime イベントが連続した場合のリクエスト過多防止）
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      router.refresh()
    }, 300)
  }, [router])

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel(`dashboard:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const newRecord = payload.new as { id?: string; status?: string } | null
          // paid（新規注文）への遷移時に効果音
          if (
            newRecord?.status === 'paid' &&
            prevStatusRef.current[newRecord.id!] !== 'paid'
          ) {
            playNewOrderSound()
          }
          if (newRecord?.id) {
            prevStatusRef.current[newRecord.id] = newRecord.status ?? ''
          }
          debouncedRefresh()
        }
      )
      .subscribe()

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [storeId, debouncedRefresh])

  return null
}
