'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'
import type { WaitMinutes } from '@/lib/database.aliases'

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
  revalidateTag(`store:${storeId}`, 'max')
  // slug ベースのタグ・パスキャッシュもパージ
  const { data } = await supabase.from('stores').select('slug').eq('id', storeId).single()
  if (data?.slug) {
    revalidateTag(`store-slug:${data.slug}`, 'max')
    revalidatePath(`/${data.slug}`)
  }
}

// ------------------------------------------------------------
// 営業時間
// ------------------------------------------------------------
// saveStoreHoursAction は HoursPanel への移行に伴い削除。
// 営業時間の保存は /api/admin/hours の PUT エンドポイントで行う。

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

  // 外部 URL (任意、空文字 → NULL、http(s) のみ、2048 文字以内)
  // 各店舗の特商法 / アレルゲン情報は自社サイトで担保する設計
  // (docs/payment-design-legal.md §3 取次事業者モデル)
  function parseUrl(field: string): string | null | { error: string } {
    const raw = formData.get(field)
    if (typeof raw !== 'string' || !raw.trim()) return null
    const v = raw.trim()
    if (!/^https?:\/\/[^\s]+$/i.test(v)) return { error: `${field === 'tokushoho_url' ? '特商法URL' : 'アレルゲン情報URL'} は http(s) で始まる URL を入力してください。` }
    if (v.length > 2048) return { error: 'URL が長すぎます (2048 文字以内)。' }
    return v
  }
  const tokushohoUrlResult = parseUrl('tokushoho_url')
  if (tokushohoUrlResult && typeof tokushohoUrlResult === 'object') return tokushohoUrlResult
  const allergenUrlResult = parseUrl('allergen_url')
  if (allergenUrlResult && typeof allergenUrlResult === 'object') return allergenUrlResult
  const tokushohoUrl = tokushohoUrlResult as string | null
  const allergenUrl = allergenUrlResult as string | null

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
    .update({
      name: name.trim(),
      slug: slug.trim(),
      description,
      area,
      cuisine_type: cuisineType,
      tokushoho_url: tokushohoUrl,
      allergen_url: allergenUrl,
    })
    .eq('id', session.storeId)

  if (error) {
    if (error.code === '23505') return { error: 'そのURLはすでに使用されています。' }
    console.error('[store/profile]', error)
    return { error: '更新に失敗しました。' }
  }

  revalidatePath('/admin/settings')

  // 旧スラッグのキャッシュを即時パージ（slug 変更前に取得した current.slug を使用）
  if (current?.slug) {
    revalidateTag(`store-slug:${current.slug}`, 'max')
    revalidatePath(`/${current.slug}`)
  }

  // storeId タグでキャッシュを一括パージ
  revalidateTag(`store:${session.storeId}`, 'max')

  // 新スラッグが変更されていれば新スラッグ側もパージ
  if (slug.trim() !== current?.slug) {
    revalidateTag(`store-slug:${slug.trim()}`, 'max')
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

/** ヘッダー右上の StoreToggle 専用：受取時間（wait_minutes）のみを更新する */
export async function updateWaitMinutesAction(
  waitMinutes: number,
): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  if (!VALID_WAIT_MINUTES.includes(waitMinutes as typeof VALID_WAIT_MINUTES[number])) {
    return { error: '受取時間の値が不正です。' }
  }

  const { error } = await supabase
    .from('stores')
    .update({ wait_minutes: waitMinutes as WaitMinutes })
    .eq('id', session.storeId)

  if (error) {
    console.error('[store/wait]', error)
    return { error: '受取時間の更新に失敗しました。' }
  }

  revalidatePath('/admin/dashboard')
  await revalidateStore(supabase, session.storeId)
}

/** ヘッダー右上の StoreToggle 専用：手動オーバーライドを解除して自動制御へ戻す */
export async function clearStoreOverrideAction(): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('stores')
    .update({ manual_override_until: null })
    .eq('id', session.storeId)

  if (error) {
    console.error('[store/override-clear]', error)
    return { error: '解除に失敗しました。' }
  }

  revalidatePath('/admin/dashboard')
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
