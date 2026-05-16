'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'

/**
 * 公開店舗ページのキャッシュを即時パージする。
 *
 * store:{storeId} タグ → getCachedMenuItems / getCachedStoreHours を無効化。
 * store-slug:{slug} タグ → getCachedStore / getCachedStoreMeta を無効化。
 * revalidatePath でパスキャッシュも削除。
 */
async function revalidateStore(supabase: ReturnType<typeof createServiceClient>, storeId: string) {
  revalidateTag(`store:${storeId}`)
  // slug ベースのタグ・パスキャッシュもパージ
  const { data } = await supabase.from('stores').select('slug').eq('id', storeId).single()
  if (data?.slug) {
    revalidateTag(`store-slug:${data.slug}`)
    revalidatePath(`/${data.slug}`)
  }
}

export type MenuActionState = { error: string } | { success: true } | undefined

export async function createMenuItemAction(
  _prev: MenuActionState,
  formData: FormData
): Promise<MenuActionState> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const name = formData.get('name')
  const priceStr = formData.get('price')
  const category = formData.get('category')
  const emoji = formData.get('emoji')
  const description = formData.get('description')

  if (typeof name !== 'string' || !name.trim()) {
    return { error: '商品名を入力してください。' }
  }
  const price = parseInt(String(priceStr), 10)
  if (isNaN(price) || price < 0) {
    return { error: '価格は0以上の整数を入力してください。' }
  }

  // 同店舗内の最大 sort_order + 1 を新しいアイテムに割り当て（swap が機能するために必要）
  const { data: maxRow } = await supabase
    .from('menu_items')
    .select('sort_order')
    .eq('store_id', session.storeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1

  const emojiVal = typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : null

  const { error } = await supabase.from('menu_items').insert({
    store_id: session.storeId,
    name: name.trim(),
    price,
    description: typeof description === 'string' && description.trim() ? description.trim().slice(0, 200) : null,
    category: typeof category === 'string' && category.trim() ? category.trim().slice(0, 50) : null,
    emoji: emojiVal,
    sort_order: nextSortOrder,
  })

  if (error) {
    console.error('[menu/create]', error)
    return { error: '登録に失敗しました。' }
  }

  revalidatePath('/admin/menu')
  await revalidateStore(supabase, session.storeId)
  return { success: true }
}

export async function updateMenuItemAction(
  _prev: MenuActionState,
  formData: FormData
): Promise<MenuActionState> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const id = formData.get('id')
  const name = formData.get('name')
  const priceStr = formData.get('price')
  const category = formData.get('category')
  const emoji = formData.get('emoji')
  const description = formData.get('description')

  if (typeof id !== 'string' || !id) return { error: '不正なリクエストです。' }
  if (typeof name !== 'string' || !name.trim()) return { error: '商品名を入力してください。' }
  const price = parseInt(String(priceStr), 10)
  if (isNaN(price) || price < 0) return { error: '価格は0以上の整数を入力してください。' }

  const { error } = await supabase
    .from('menu_items')
    .update({
      name: name.trim(),
      price,
      description: typeof description === 'string' && description.trim() ? description.trim().slice(0, 200) : null,
      category: typeof category === 'string' && category.trim() ? category.trim().slice(0, 50) : null,
      emoji: typeof emoji === 'string' && emoji.trim() ? emoji.trim().slice(0, 8) : null,
    })
    .eq('id', id)
    .eq('store_id', session.storeId)

  if (error) {
    console.error('[menu/update]', error)
    return { error: '更新に失敗しました。' }
  }

  revalidatePath('/admin/menu')
  await revalidateStore(supabase, session.storeId)
  return { success: true }
}

export async function toggleMenuItemAction(id: string, isAvailable: boolean): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: isAvailable })
    .eq('id', id)
    .eq('store_id', session.storeId)

  if (error) {
    console.error('[menu/toggle]', error)
    return { error: '販売状態の更新に失敗しました。' }
  }

  revalidatePath('/admin/menu')
  await revalidateStore(supabase, session.storeId)
}

export async function moveMenuItemAction(id: string, direction: 'up' | 'down'): Promise<void> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  // 同一カテゴリ内の全アイテムを取得して順序を入れ替え
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, sort_order, category')
    .eq('id', id)
    .single()

  if (!item) return

  const baseQuery = supabase
    .from('menu_items')
    .select('id, sort_order')
    .eq('store_id', session.storeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const { data: siblings } = await (item.category !== null
    ? baseQuery.eq('category', item.category)
    : baseQuery.is('category', null))

  if (!siblings || siblings.length < 2) return

  const idx = siblings.findIndex(s => s.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= siblings.length) return

  // sort_order が同値 or null の場合はインデックスベースで初期化してからスワップ
  const needsInit = siblings.some(s => s.sort_order === null) ||
    new Set(siblings.map(s => s.sort_order)).size < siblings.length

  let sortOrders: number[]
  if (needsInit) {
    sortOrders = siblings.map((_, i) => (i + 1) * 10)
    await Promise.all(
      siblings.map((s, i) =>
        supabase.from('menu_items').update({ sort_order: sortOrders[i] }).eq('id', s.id)
      )
    )
  } else {
    sortOrders = siblings.map(s => s.sort_order as number)
  }

  await Promise.all([
    supabase.from('menu_items').update({ sort_order: sortOrders[swapIdx] }).eq('id', siblings[idx].id),
    supabase.from('menu_items').update({ sort_order: sortOrders[idx] }).eq('id', siblings[swapIdx].id),
  ])

  revalidatePath('/admin/menu')
  await revalidateStore(supabase, session.storeId)
}

export async function deleteMenuItemAction(id: string): Promise<{ error: string } | undefined> {
  const session = await verifyStoreSession()
  const supabase = createServiceClient()

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', id)
    .eq('store_id', session.storeId)

  if (error) {
    console.error('[menu/delete]', error)
    return { error: '商品の削除に失敗しました。' }
  }

  revalidatePath('/admin/menu')
  await revalidateStore(supabase, session.storeId)
}
