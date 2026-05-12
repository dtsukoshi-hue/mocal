import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { logger } from '@/lib/logger'

const BUCKET = 'store-images'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Kind = 'logo' | 'cover'

function parseKind(value: FormDataEntryValue | null): Kind | null {
  return value === 'logo' || value === 'cover' ? value : null
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png')  return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

// POST: ロゴまたはカバー画像をアップロード
export async function POST(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const kind = parseKind(form.get('kind'))
  if (!kind) {
    return NextResponse.json({ error: '画像種別が不正です。（logo / cover）' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが不正です。' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'ファイルが空です。' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `ファイルサイズが大きすぎます（最大 ${MAX_BYTES / 1024 / 1024}MB）。` }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'JPEG / PNG / WebP のみアップロード可能です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ext = extFromMime(file.type)
  const path = `${session.storeId}/${kind}.${ext}`

  // 拡張子が異なる既存ファイルを削除（例: logo.jpg → logo.png に変更した場合）
  const { data: existingFiles } = await supabase.storage.from(BUCKET).list(session.storeId)
  const existing = (existingFiles ?? []).find(f => f.name.startsWith(kind + '.') && f.name !== `${kind}.${ext}`)
  if (existing) {
    await supabase.storage.from(BUCKET).remove([`${session.storeId}/${existing.name}`]).catch(() => {})
  }

  const { error: uploadErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })

  if (uploadErr) {
    logger.error('store image upload error', { storeId: session.storeId, kind, error: uploadErr.message })
    return NextResponse.json({ error: 'アップロードに失敗しました。' }, { status: 500 })
  }

  // 公開 URL を取得
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // キャッシュバスター（古い画像のキャッシュを避ける）
  const url = `${pub.publicUrl}?v=${Date.now()}`

  // DB を更新
  const update = kind === 'logo' ? { logo_url: url } : { cover_url: url }
  const { error: dbErr } = await supabase
    .from('stores')
    .update(update)
    .eq('id', session.storeId)

  if (dbErr) {
    logger.error('store image update error', { storeId: session.storeId, kind, code: dbErr.code })
    return NextResponse.json({ error: '保存に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url })
}

// DELETE: 画像を削除（DB の url を null にし、バケットからも削除する）
export async function DELETE(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { kind?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const kind = body.kind === 'logo' || body.kind === 'cover' ? body.kind : null
  if (!kind) {
    return NextResponse.json({ error: '画像種別が不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // バケットから該当ファイルを削除
  const { data: existingFiles } = await supabase.storage.from(BUCKET).list(session.storeId)
  const toDelete = (existingFiles ?? [])
    .filter(f => f.name.startsWith(kind + '.'))
    .map(f => `${session.storeId}/${f.name}`)
  if (toDelete.length > 0) {
    await supabase.storage.from(BUCKET).remove(toDelete).catch(() => {})
  }

  const update = kind === 'logo' ? { logo_url: null } : { cover_url: null }
  const { error } = await supabase
    .from('stores')
    .update(update)
    .eq('id', session.storeId)

  if (error) {
    logger.error('store image delete error', { storeId: session.storeId, kind, code: error.code })
    return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
