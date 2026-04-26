import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionPayload } from '@/lib/session'

export async function PATCH(request: NextRequest) {
  const session = await getSessionPayload()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: { is_open: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  if (typeof body.is_open !== 'boolean') {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('stores')
    .update({ is_open: body.is_open })
    .eq('id', session.storeId)

  if (error) {
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  return NextResponse.json({ is_open: body.is_open })
}
