import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { hashPassword, validateEmail, validatePassword } from '@/lib/staff-auth'
import { logger } from '@/lib/logger'

// オーナーのみがスタッフを管理できる
async function ownerOnly() {
  const session = await getSessionPayload()
  if (!session) return { error: '認証が必要です。', status: 401 as const }
  if (session.role !== 'owner') return { error: '権限がありません。', status: 403 as const }
  return { session }
}

// GET /api/admin/staff - 自店舗のスタッフ一覧
export async function GET() {
  const auth = await ownerOnly()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('staff_accounts')
    .select('id, email, role, created_at')
    .eq('store_id', auth.session.storeId)
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('staff list error', { storeId: auth.session.storeId, code: error.code })
    return NextResponse.json({ error: '取得に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ staff: data ?? [] })
}

// POST /api/admin/staff - 新規スタッフ作成
export async function POST(request: NextRequest) {
  const auth = await ownerOnly()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: { email?: unknown; password?: unknown; role?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const emailCheck = validateEmail(body.email)
  if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.reason }, { status: 400 })

  const passCheck = validatePassword(body.password)
  if (!passCheck.ok) return NextResponse.json({ error: passCheck.reason }, { status: 400 })

  // role は staff のみを許可（owner の追加は env 経由のみ）
  const role = 'staff' as const
  if (body.role !== undefined && body.role !== 'staff') {
    return NextResponse.json(
      { error: 'owner ロールはこのエンドポイントから付与できません。' },
      { status: 400 }
    )
  }

  const normalizedEmail = body.email.trim().toLowerCase()

  // env owner と同じメールは禁止（混乱を避ける）
  if (normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase()) {
    return NextResponse.json(
      { error: 'このメールアドレスは既に使用されています。' },
      { status: 409 }
    )
  }

  const supabase = createServiceClient()

  const passwordHash = await hashPassword(body.password)

  const { data, error } = await supabase
    .from('staff_accounts')
    .insert({
      store_id: auth.session.storeId,
      email: normalizedEmail,
      password_hash: passwordHash,
      role,
    })
    .select('id, email, role, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'このメールアドレスは既に使用されています。' },
        { status: 409 }
      )
    }
    logger.error('staff create error', { storeId: auth.session.storeId, code: error.code })
    return NextResponse.json({ error: '作成に失敗しました。' }, { status: 500 })
  }

  logger.info('staff created', { storeId: auth.session.storeId, staffId: data.id })
  return NextResponse.json({ staff: data }, { status: 201 })
}
