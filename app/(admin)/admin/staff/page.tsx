export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'
import { redirect } from 'next/navigation'
import StaffManager from './_components/StaffManager'
import AdminNav from '../_components/AdminNav'

export default async function StaffPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) redirect('/admin/login')
  const session = verifySessionToken(token!)
  if (!session) redirect('/admin/login')

  // owner 以外は閲覧不可（dashboard へ戻す）
  if (session.role !== 'owner') redirect('/admin/dashboard')

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="staff" role="owner" />

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-bold text-gray-900 mb-4">スタッフ管理</h1>
        <StaffManager />
      </main>
    </div>
  )
}
