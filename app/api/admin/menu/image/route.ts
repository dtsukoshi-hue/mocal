import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'

const BUCKET = 'menu-images'
const MAX_SIZE = 5 * 1024 * 1024   // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof verifyStoreSession>>
  try {
    session = await verifyStoreSession()
  } catch {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'リクエストの解析に失敗しました。' }, { status: 400 })
  }

  const file = formData.get('file')
  const menuItemId = formData.get('menuItemId')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 400 })
  }
  if (typeof menuItemId !== 'string' || !menuItemId) {
    return NextResponse.json({ error: 'menuItemId が必要です。' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'JPEG・PNG・WebP 形式のみアップロードできます。' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 5MB 以下にしてください。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // メニューアイテムが自店舗のものか確認
  const { data: menuItem } = await supabase
    .from('menu_items')
    .select('id')
    .eq('id', menuItemId)
    .eq('store_id', session.storeId)
    .single()

  if (!menuItem) {
    return NextResponse.json({ error: 'メニューアイテムが見つかりません。' }, { status: 404 })
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${session.storeId}/${menuItemId}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    console.error('[menu/image] upload error:', uploadError)
    return NextResponse.json({ error: 'アップロードに失敗しました。' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const urlWithCacheBuster = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase
    .from('menu_items')
    .update({ image_url: urlWithCacheBuster })
    .eq('id', menuItemId)

  if (updateError) {
    console.error('[menu/image] db update error:', updateError)
    return NextResponse.json({ error: '画像URLの保存に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ url: urlWithCacheBuster })
}
