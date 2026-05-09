import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-ssr'
import { createServiceClient } from '@/lib/supabase-server'
import { notifyStore } from '@/lib/webpush'

// POST /api/push/test — 店舗メンバーが自分の通知設定を確認するためのテスト送信
export async function POST() {
  const supabaseUser = await createSupabaseServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: membership } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 })
  }

  try {
    await notifyStore(membership.store_id, {
      title: '通知テスト',
      body: 'mocal の通知が正常に動作しています',
      url: '/admin/dashboard',
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '通知の送信に失敗しました。' }, { status: 500 })
  }
}
