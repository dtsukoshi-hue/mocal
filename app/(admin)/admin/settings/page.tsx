export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import StoreSettingsForm from './_components/StoreSettingsForm'
import StripeConnectSection from './_components/StripeConnectSection'
import StoreImagesSection from './_components/StoreImagesSection'
import QRCodeSection from './_components/QRCodeSection'
import AdminNav from '../_components/AdminNav'
import { logoutAction } from '@/app/actions/auth'

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

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-4">
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
        <QRCodeSection storeId={sessionData.storeId} storeName={store.name} />

        {/* ── ログアウト */}
        <div className="pt-4 pb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full px-5 py-4 text-left text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                ログアウト
              </button>
            </form>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-4">mocal 店舗管理</p>
        </div>
      </main>
    </div>
  )
}
