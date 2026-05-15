import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyStoreSession } from '@/lib/dal'

const BUCKET = 'store-images'
const MAX_SIZE = 5 * 1024 * 1024   // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

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
  const type = formData.get('type')  // 'logo' | 'cover'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが見つかりません。' }, { status: 400 })
  }
  if (type !== 'logo' && type !== 'cover') {
    return NextResponse.json({ error: 'type は logo または cover で指定してください。' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'JPEG・PNG・WebP・GIF 形式のみアップロードできます。' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 5MB 以下にしてください。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${session.storeId}/${type}.${ext}`

  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,           // 既存ファイルを上書き
    })

  if (uploadError) {
    console.error('[store/image] upload error:', uploadError)
    return NextResponse.json({ error: 'アップロードに失敗しました。' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path)

  // キャッシュバスター付き URL をDBに保存
  const urlWithCacheBuster = `${publicUrl}?v=${Date.now()}`
  const updatePayload = type === 'logo'
    ? { logo_url: urlWithCacheBuster }
    : { cover_url: urlWithCacheBuster }

  const { error: updateError } = await supabase
    .from('stores')
    .update(updatePayload)
    .eq('id', session.storeId)

  if (updateError) {
    console.error('[store/image] db update error:', updateError)
    return NextResponse.json({ error: '画像URLの保存に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ url: urlWithCacheBuster })
}

export async function DELETE(request: NextRequest) {
  let session: Awaited<ReturnType<typeof verifyStoreSession>>
  try {
    session = await verifyStoreSession()
  } catch {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの解析に失敗しました。' }, { status: 400 })
  }

  const { type } = body
  if (type !== 'logo' && type !== 'cover') {
    return NextResponse.json({ error: 'type は logo または cover で指定してください。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ストレージ上の該当プレフィックスのファイルを全削除（拡張子不問）
  const { data: files } = await supabase.storage
    .from(BUCKET)
    .list(session.storeId, { search: `${type}.` })

  if (files && files.length > 0) {
    const paths = files.map(f => `${session.storeId}/${f.name}`)
    await supabase.storage.from(BUCKET).remove(paths)
  }

  // DB の URL を null にクリア
  const updatePayload = type === 'logo'
    ? { logo_url: null }
    : { cover_url: null }

  const { error: updateError } = await supabase
    .from('stores')
    .update(updatePayload)
    .eq('id', session.storeId)

  if (updateError) {
    console.error('[store/image] delete db update error:', updateError)
    return NextResponse.json({ error: '画像の削除に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
