import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import Link from 'next/link'
import HoursForm from './_components/HoursForm'

export const metadata: Metadata = { title: '営業時間 | mocal' }

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export default async function HoursPage() {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  const { data: rows } = await supabase
    .from('store_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('store_id', session.storeId)
    .order('day_of_week')

  // 既存レコードを曜日でマップ化（なければデフォルト値）
  const hoursByDow = Object.fromEntries((rows ?? []).map(r => [r.day_of_week, r]))
  const hours = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    label: DAY_LABELS[dow],
    open_time:  hoursByDow[dow]?.open_time  ?? '10:00',
    close_time: hoursByDow[dow]?.close_time ?? '20:00',
    is_closed:  hoursByDow[dow]?.is_closed  ?? false,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
            <span aria-hidden="true">← </span>注文管理
          </Link>
          <h1 className="text-lg font-bold text-gray-900">営業時間</h1>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <p className="font-semibold text-gray-900">曜日別営業時間</p>
            <p className="text-xs text-gray-500 mt-0.5">
              設定した時間になると自動で受付を開始・終了します。
              ダッシュボードの手動切り替えは当日中のみ有効です。
            </p>
          </div>
          <HoursForm hours={hours} />
        </div>
      </main>
    </div>
  )
}
