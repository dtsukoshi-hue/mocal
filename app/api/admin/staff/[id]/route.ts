import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'
import { hashPassword, validatePassword } from '@/lib/staff-auth'
import { isUuid } from '@/lib/validation'
import { logger } from '@/lib/logger'

async function authorize(id: string) {
  if (!isUuid(id)) return { error: '見つかりません', status: 404 as const }
  const session = await getSessionPayload()
  if (!session) return { error: '認証が必要です。', status: 401 as const }
  if (session.role !== 'owner') return { error: '権限がありません。', status: 403 as const }

  const supabase = createServiceClient()
  const { data: staff } = await supabase
    .from('staff_accounts')
    .select('id, store_id')
    .eq('id', id)
    .single()

  if (!staff) return { error: '見つかりません', status: 404 as const }
  if (staff.store_id !== session.storeId) {
    return { error: '権限がありません。', status: 403 as const }
  }
  return { session, supabase }
}

// PATCH /api/admin/staff/[id] - パスワード変更
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<'/api/admin/staff/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (typeof body.password !== 'string') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const check = validatePassword(body.password)
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })

  const passwordHash = await hashPassword(body.password)
  const { error } = await auth.supabase
    .from('staff_accounts')
    .update({ password_hash: passwordHash })
    .eq('id', id)

  if (error) {
    logger.error('staff password update error', { id, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/staff/[id] - スタッフ削除
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<'/api/admin/staff/[id]'>
) {
  const { id } = await ctx.params
  const auth = await authorize(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.supabase
    .from('staff_accounts')
    .delete()
    .eq('id', id)

  if (error) {
    logger.error('staff delete error', { id, code: error.code })
    return NextResponse.json({ error: '削除に失敗しました。' }, { status: 500 })
  }

  logger.info('staff deleted', { id, storeId: auth.session.storeId })
  return NextResponse.json({ ok: true })
}
