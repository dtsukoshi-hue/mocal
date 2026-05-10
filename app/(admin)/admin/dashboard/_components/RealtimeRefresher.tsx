'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// 管理画面は Supabase Auth セッションを持たない（カスタム JWT 認証）ため、
// anon キーでの Realtime postgres_changes サブスクリプションは RLS により
// イベントが届かない。代わりに 30 秒ポーリングで Server Components を再取得し、
// Realtime が届いた場合はそちらを優先する（二重更新しても支障なし）。

const POLL_INTERVAL_MS = 30_000

export default function RealtimeRefresher({ storeId }: { storeId: string }) {
  const router = useRouter()
  const refreshedAt = useRef(0)

  function safeRefresh() {
    const now = Date.now()
    // 直近 3 秒以内に refresh 済みなら重複を避ける
    if (now - refreshedAt.current < 3_000) return
    refreshedAt.current = now
    router.refresh()
  }

  // Realtime サブスクリプション（RLS が通れば即時更新）
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel('dashboard-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        () => { safeRefresh() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  // ポーリングフォールバック（Realtime が届かない場合も 30 秒ごとに更新）
  useEffect(() => {
    const id = setInterval(safeRefresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
