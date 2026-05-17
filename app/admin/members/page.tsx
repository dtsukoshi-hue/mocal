import type { Metadata } from 'next'
import { verifyStoreSession } from '@/lib/dal'
import { createServiceClient } from '@/lib/supabase-server'
import InviteStaffForm from './_components/InviteStaffForm'
import RemoveMemberButton from './_components/RemoveMemberButton'
import AdminNav from '../_components/AdminNav'

export const metadata: Metadata = { title: 'スタッフ管理 | mocal' }

export default async function MembersPage() {
  const session = await verifyStoreSession()

  // service_role で全メンバーを取得（anon key の RLS は user_id = auth.uid() のみ許可するため）
  const serviceClient = createServiceClient()

  // メンバー一覧（auth.users と JOIN はできないので user_id だけ取得し別途解決）
  const { data: members } = await serviceClient
    .from('store_members')
    .select('id, user_id, role')
    .eq('store_id', session.storeId)
  const memberIds = (members ?? []).map(m => m.user_id)
  const userEntries = await Promise.all(
    memberIds.map(async (uid) => {
      const { data } = await serviceClient.auth.admin.getUserById(uid)
      return [uid, data.user?.email ?? uid] as [string, string]
    })
  )
  const userMap = Object.fromEntries(userEntries)

  const isOwner = session.role === 'owner'

  return (
    <div className="min-h-screen bg-stone-50">
      <AdminNav active="staff" role={session.role as 'owner' | 'staff'} title="スタッフ管理" />

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {isOwner && <InviteStaffForm />}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <ul className="divide-y">
            {(members ?? []).map(member => (
              <li key={member.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {userMap[member.user_id] ?? member.user_id}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {member.role === 'owner' ? 'オーナー' : 'スタッフ'}
                  </p>
                </div>
                {isOwner && member.role !== 'owner' && (
                  <RemoveMemberButton memberId={member.id} email={userMap[member.user_id] ?? member.user_id} />
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
