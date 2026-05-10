'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'

export type MemberActionState = { error: string } | { success: string } | undefined

// メールアドレスでスタッフを招待（Supabase Auth にユーザーが存在する場合のみ）
export async function inviteStaffAction(
  _prev: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const session = await verifyStoreSession()
  if (session.role !== 'owner') {
    return { error: 'オーナーのみスタッフを追加できます。' }
  }

  const email = formData.get('email')
  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'メールアドレスを入力してください。' }
  }

  const supabase = createServiceClient()

  // DB 関数でメールアドレスから user_id を取得（listUsers 全件取得を回避）
  const { data: userId, error: rpcErr } = await supabase
    .rpc('get_user_id_by_email', { p_email: email.trim() })

  if (rpcErr) {
    console.error('[members/invite] ユーザー検索失敗:', rpcErr)
    return { error: 'サーバーエラーが発生しました。' }
  }

  if (!userId) {
    return { error: 'そのメールアドレスのユーザーが見つかりません。先に mocal に登録してもらってください。' }
  }

  // 既にメンバーか確認
  const { data: existing } = await supabase
    .from('store_members')
    .select('id')
    .eq('store_id', session.storeId)
    .eq('user_id', userId)
    .single()

  if (existing) {
    return { error: 'このユーザーはすでにメンバーです。' }
  }

  const { error: insertErr } = await supabase
    .from('store_members')
    .insert({ store_id: session.storeId, user_id: userId, role: 'staff' })

  if (insertErr) {
    console.error('[members/invite] メンバー追加失敗:', insertErr)
    return { error: 'メンバーの追加に失敗しました。' }
  }

  revalidatePath('/admin/members')
  return { success: `${email} をスタッフとして追加しました。` }
}

export async function removeMemberAction(memberId: string): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  if (session.role !== 'owner') return { error: 'オーナーのみスタッフを削除できます。' }

  const supabase = createServiceClient()

  // 自分自身は削除不可
  const { data: member } = await supabase
    .from('store_members')
    .select('user_id')
    .eq('id', memberId)
    .single()

  if (member?.user_id === session.userId) return { error: 'オーナー自身は削除できません。' }

  const { error } = await supabase
    .from('store_members')
    .delete()
    .eq('id', memberId)
    .eq('store_id', session.storeId)

  if (error) {
    console.error('[members/remove]', error)
    return { error: 'スタッフの削除に失敗しました。' }
  }

  revalidatePath('/admin/members')
}
