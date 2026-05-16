'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'
import type { WaitMinutes } from '@/lib/database.types'

/**
 * 公開店舗ページのキャッシュを即時パージする。
 *
 * store:{storeId} タグ → getCachedMenuItems / getCachedStoreHours を無効化。
 * store-slug:{slug} タグ → getCachedStore / getCachedStoreMeta を無効化。
 * revalidatePath でパスキャッシュも削除。
 */
async function revalidateStore(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
) {
  revalidateTag(`store:${storeId}`)
  // slug ベースのタグ・パスキャッシュもパージ
  const { data } = await supabase.from('stores').select('slug').eq('id', storeId).single()
  if (data?.slug) {
    revalidateTag(`store-slug:${data.slug}`)
    revalidatePath(`/${data.slug}`)
  }
}

// ------------------------------------------------------------
// 営業時間
// ------------------------------------------------------------

/** フォームから送られてきた 7 曜日分の営業時間を upsert する */
export async function saveStoreHoursAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  // formData 形式: is_closed_{dow}, open_{dow}, close_{dow}
  type Row = {
    store_id: string
    day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6
    open_time: string
    close_time: string
    is_closed: boolean
  }
  const rows = (Array.from({ length: 7 }, (_, dow) => {
    const isClosed = formData.get(`is_closed_${dow}`) === '1'
    const openTime  = String(formData.get(`open_${dow}`)  ?? '10:00').slice(0, 5)
    const closeTime = String(formData.get(`close_${dow}`) ?? '20:00').slice(0, 5)
    // HH:MM 形式の簡易バリデーション
    const timeRe = /^\d{2}:\d{2}$/
    if (!timeRe.test(openTime) || !timeRe.test(closeTime)) return null
    return {
      store_id: session.storeId,
      day_of_week: dow as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      open_time: openTime,
      close_time: closeTime,
      is_closed: isClosed,
    }
  }).filter((r): r is Row => r !== null))

  if (rows.length !== 7) return { error: '時間の形式が不正です（HH:MM で入力してください）。' }

  const { error } = await supabase
    .from('store_hours')
    .upsert(rows, { onConflict: 'store_id,day_of_week' })

  if (error) {
    console.error('[store/hours]', error)
    return { error: '営業時間の保存に失敗しました。' }
  }

  revalidatePath('/admin/hours')
  await revalidateStore(supabase, session.storeId)
  return { success: true }
}

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
  const areaRaw = formData.get('area')
  const area = typeof areaRaw === 'string' && areaRaw.trim()
    ? areaRaw.trim().slice(0, 30)
    : null
  const cuisineTypeRaw = formData.get('cuisine_type')
  const cuisineType = typeof cuisineTypeRaw === 'string' && cuisineTypeRaw.trim()
    ? cuisineTypeRaw.trim().slice(0, 30)
    : null

  if (typeof name !== 'string' || !name.trim()) return { error: '店舗名を入力してください。' }
  if (typeof slug !== 'string' || !slug.trim()) return { error: 'URLを入力してください。' }
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return { error: 'URLは英小文字・数字・ハイフンのみ、3〜50文字で入力してください。' }
  }

  // スラッグ変更の場合は旧スラッグも revalidate する必要があるため更新前に取得
  const { data: current } = await supabase
    .from('stores')
    .select('slug')
    .eq('id', session.storeId)
    .single()

  const { error } = await supabase
    .from('stores')
    .update({ name: name.trim(), slug: slug.trim(), description, area, cuisine_type: cuisineType })
    .eq('id', session.storeId)

  if (error) {
    if (error.code === '23505') return { error: 'そのURLはすでに使用されています。' }
    console.error('[store/profile]', error)
    return { error: '更新に失敗しました。' }
  }

  revalidatePath('/admin/settings')

  // 旧スラッグのキャッシュを即時パージ（slug 変更前に取得した current.slug を使用）
  if (current?.slug) {
    revalidateTag(`store-slug:${current.slug}`)
    revalidatePath(`/${current.slug}`)
  }

  // storeId タグでキャッシュを一括パージ
  revalidateTag(`store:${session.storeId}`)

  // 新スラッグが変更されていれば新スラッグ側もパージ
  if (slug.trim() !== current?.slug) {
    revalidateTag(`store-slug:${slug.trim()}`)
    revalidatePath(`/${slug.trim()}`)
  }

  return { success: true }
}

export async function toggleStoreOpenAction(isOpen: boolean): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  // 手動切り替えは当日 JST 23:59:59 まで有効（cron による自動切り替えを抑制）
  const jstMidnight = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const manualOverrideUntil = new Date(`${jstMidnight}T23:59:59+09:00`).toISOString()

  const { error } = await supabase
    .from('stores')
    .update({ is_open: isOpen, manual_override_until: manualOverrideUntil })
    .eq('id', session.storeId)

  if (error) {
    console.error('[store/toggle]', error)
    return { error: '受付状態の更新に失敗しました。' }
  }

  revalidatePath('/admin/settings')
  revalidatePath('/admin/dashboard')
  // 受付状態変更は store_cache の getCachedStore をパージ（is_open フィールドを含むため）
  await revalidateStore(supabase, session.storeId)
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
  await revalidateStore(supabase, session.storeId)
  return { success: true }
}
