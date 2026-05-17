import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import AdminNav from '../_components/AdminNav'
import HoursPanel from './_components/HoursPanel'

export const metadata: Metadata = { title: '営業時間・受付設定 | mocal' }

export default async function HoursPage() {
  const session = await verifyStoreSession()
  const supabase = await createSupabaseServerClient()

  const { data: store } = await supabase
    .from('stores')
    .select('is_open, wait_minutes, manual_override_until')
    .eq('id', session.storeId)
    .single()

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="hours" role={session.role as 'owner' | 'staff'} />

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-bold text-gray-900 mb-2">営業時間・受付設定</h1>
        <HoursPanel
          isOpen={store?.is_open ?? true}
          waitMinutes={store?.wait_minutes ?? 15}
          overrideUntil={store?.manual_override_until ?? null}
        />
      </main>
    </div>
  )
}
