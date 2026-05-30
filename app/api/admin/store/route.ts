import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { getStoreSession } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { VALID_WAIT_MINUTES } from '@/lib/validation'
import type { StoreInsert, WaitMinutes } from '@/lib/database.aliases'

// PATCH /api/admin/store
//   - { is_open: boolean }                       → 受付切替（manual_override_until を当日 23:59:59 まで設定）
//   - { wait_minutes: 10|15|20|30|40|60 }        → 予定受取時間
//   - { clear_override: true }                   → 自動制御へ戻す（manual_override_until = null）
//
// HoursPanel.tsx と StoreToggle.tsx の両方から呼ばれる。
export async function PATCH(request: NextRequest) {
  const session = await getStoreSession()
  if (!session) {
    return NextResponse.json({ error: '認証が必要です。' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 })
  }

  const update: Partial<StoreInsert> = {}
  let manualOverrideUntil: string | null = null

  if (typeof body.is_open === 'boolean') {
    update.is_open = body.is_open
    // 手動切り替えは当日 JST 23:59:59 まで有効（cron 自動切り替えを抑制）
    const jstMidnight = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    manualOverrideUntil = new Date(`${jstMidnight}T23:59:59+09:00`).toISOString()
    update.manual_override_until = manualOverrideUntil
  }

  // is_open=true への切替は Connect 接続必須 (docs/payment-design-legal.md L4)
  // Connect 未接続店舗を公開状態にできてしまうと、顧客が注文 → 通常 charge 経路 →
  // mocal が販売者として代金を預かる構造 (資金決済法 §37 違反相当) になり得る。
  if (update.is_open === true) {
    const supabaseCheck = createServiceClient()
    const { data: storeRow } = await supabaseCheck
      .from('stores')
      .select('stripe_account_id')
      .eq('id', session.storeId)
      .single()
    if (!storeRow?.stripe_account_id) {
      return NextResponse.json(
        {
          error: 'Stripe Connect への接続が完了していません。受付開始 (公開) には Connect onboarding が必要です。',
          code: 'connect_required',
        },
        { status: 422 },
      )
    }
  }

  if (typeof body.wait_minutes === 'number') {
    if (!VALID_WAIT_MINUTES.includes(body.wait_minutes as WaitMinutes)) {
      return NextResponse.json({ error: '予定受取時間の値が不正です。' }, { status: 400 })
    }
    update.wait_minutes = body.wait_minutes as WaitMinutes
  }

  if (body.clear_override === true) {
    update.manual_override_until = null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '更新内容が指定されていません。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('stores')
    .update(update)
    .eq('id', session.storeId)

  if (error) {
    logger.error('store update error', { storeId: session.storeId, code: error.code })
    return NextResponse.json({ error: '更新に失敗しました。' }, { status: 500 })
  }

  // 公開ページ・管理ページ両方の cache を invalidate
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/hours')
  revalidatePath('/admin/settings')
  revalidateTag(`store:${session.storeId}`, 'max')
  const { data: store } = await supabase
    .from('stores')
    .select('slug')
    .eq('id', session.storeId)
    .single()
  if (store?.slug) {
    revalidateTag(`store-slug:${store.slug}`, 'max')
    revalidatePath(`/${store.slug}`)
  }

  return NextResponse.json({
    ok: true,
    ...(manualOverrideUntil ? { manual_override_until: manualOverrideUntil } : {}),
  })
}
