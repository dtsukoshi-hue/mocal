import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation'

const BUCKET = 'menu-images'
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const TYPE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}

// POST: 画像をアップロードして menu_items.image_url に保存
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/admin/menu/[id]/image'>
) {
  const { id } = await ctx.params
  if (!isUuid(id)) {
    return NextResponse.json({ error: '見つかりません' }, { status: 404 })
  }

  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // メニューアイテムが自店舗のものか確認
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, store_id, image_url')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: '見つかりません' }, { status: 404 })
  }
  if (item.store_id !== session.storeId) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが含まれていません。' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'JPEG / PNG / WebP のみ対応しています。' },
      { status: 400 }
    )
  }

  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'ファイルサイズは 5 MB 以下にしてください。' },
      { status: 400 }
    )
  }

  // 古い画像を削除（保存名は予測不可能なので path を抽出）
  if (item.image_url) {
    const oldPath = extractStoragePath(item.image_url)
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {})
    }
  }

  // 新しいパス: store_id / item_id / timestamp.<ext>
  const ext = TYPE_EXT[file.type] ?? 'bin'
  const path = `${session.storeId}/${id}/${Date.now()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadErr) {
    logger.error('menu image upload error', { itemId: id, code: uploadErr.message })
    return NextResponse.json({ error: 'アップロードに失敗しました。' }, { status: 500 })
  }

  // 公開 URL を取得
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  // menu_items に保存
  const { error: updateErr } = await supabase
    .from('menu_items')
    .update({ image_url: publicUrl })
    .eq('id', id)

  if (updateErr) {
    // 失敗時はアップロードした画像をロールバック
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    logger.error('menu image url save error', { itemId: id, code: updateErr.code })
    return NextResponse.json({ error: '保存に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: publicUrl })
}

// DELETE: 画像を削除
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/admin/menu/[id]/image'>
) {
  const { id } = await ctx.params
  if (!isUuid(id)) return NextResponse.json({ error: '見つかりません' }, { status: 404 })

  const session = await getStoreSession()
  if (!session) return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: item } = await supabase
    .from('menu_items')
    .select('id, store_id, image_url')
    .eq('id', id)
    .single()

  if (!item) return NextResponse.json({ error: '見つかりません' }, { status: 404 })
  if (item.store_id !== session.storeId) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  if (item.image_url) {
    const path = extractStoragePath(item.image_url)
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    }
  }

  const { error } = await supabase
    .from('menu_items')
    .update({ image_url: null })
    .eq('id', id)

  if (error) {
    logger.error('menu image url clear error', { itemId: id, code: error.code })
    return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// 公開 URL からバケット内のパスを抽出
// 例: https://xxx.supabase.co/storage/v1/object/public/menu-images/store/item/123.jpg
//   → store/item/123.jpg
function extractStoragePath(publicUrl: string): string | null {
  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return publicUrl.slice(idx + marker.length)
}
