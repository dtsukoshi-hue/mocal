export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import StoreSettingsForm from './_components/StoreSettingsForm'
import StripeConnectSection from './_components/StripeConnectSection'
import StoreImagesSection from './_components/StoreImagesSection'
import AdminNav from '../_components/AdminNav'

export default async function StoreSettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const sessionData = verifySessionToken(token!)
  if (!sessionData) redirect('/admin/login')

  const supabase = createServiceClient()
  const { data: store } = await supabase
    .from('stores')
    .select('name, wait_minutes, area, cuisine_type, logo_url, cover_url')
    .eq('id', sessionData.storeId)
    .single()

  if (!store) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="settings" role={sessionData.role as 'owner' | 'staff'} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-lg font-bold text-gray-900 mb-2">店舗設定</h1>
        <StoreSettingsForm
          initialName={store.name}
          initialWaitMinutes={store.wait_minutes}
          initialArea={store.area ?? ''}
          initialCuisineType={store.cuisine_type ?? ''}
        />
        <StoreImagesSection
          initialLogoUrl={store.logo_url ?? null}
          initialCoverUrl={store.cover_url ?? null}
        />
        <StripeConnectSection />
      </main>
    </div>
  )
}
