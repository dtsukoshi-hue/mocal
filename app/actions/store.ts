'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'
import type { WaitMinutes } from '@/lib/database.types'

const VALID_WAIT_MINUTES = [10, 15, 20, 30, 40, 60] as const

export async function updateStoreProfileAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const name = formData.get('name')
  const slug = formData.get('slug')
  const descriptionRaw = formData.get('description')
  const description = typeof descriptionRaw === 'string' && descriptionRaw.trim()
    ? descriptionRaw.trim().slice(0, 200)
    : null

  if (typeof name !== 'string' || !name.trim()) return { error: '店舗名を入力してください。' }
  if (typeof slug !== 'string' || !slug.trim()) return { error: 'URLを入力してください。' }
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return { error: 'URLは英小文字・数字・ハイフンのみ、3〜50文字で入力してください。' }
  }

  const { error } = await supabase
    .from('stores')
    .update({ name: name.trim(), slug: slug.trim(), description })
    .eq('id', session.storeId)

  if (error) {
    if (error.code === '23505') return { error: 'そのURLはすでに使用されています。' }
    console.error('[store/profile]', error)
    return { error: '更新に失敗しました。' }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}

export async function toggleStoreOpenAction(isOpen: boolean): Promise<void> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  await supabase
    .from('stores')
    .update({ is_open: isOpen })
    .eq('id', session.storeId)

  revalidatePath('/admin/settings')
  revalidatePath('/admin/dashboard')
}

export async function updateStoreSettingsAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const waitMinutesStr = formData.get('wait_minutes')
  const waitMinutes = parseInt(String(waitMinutesStr), 10)

  if (!VALID_WAIT_MINUTES.includes(waitMinutes as typeof VALID_WAIT_MINUTES[number])) {
    return { error: 'デフォルト待ち時間の値が不正です。' }
  }

  const { error } = await supabase
    .from('stores')
    .update({ wait_minutes: waitMinutes as WaitMinutes })
    .eq('id', session.storeId)

  if (error) {
    console.error('[store/settings]', error)
    return { error: '更新に失敗しました。' }
  }

  revalidatePath('/admin/settings')
  return { success: true }
}
