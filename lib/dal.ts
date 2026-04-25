import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSessionPayload } from './session'

// 店舗メンバーのセッション検証（React render パス内で重複呼び出しをキャッシュ）
export const verifyStoreSession = cache(async () => {
  const session = await getSessionPayload()

  if (!session) {
    redirect('/admin/login')
  }

  return {
    userId: session.email,
    email: session.email,
    storeId: session.storeId,
    role: session.role,
  }
})

// セッション取得のみ（リダイレクトしない）
export const getSession = cache(async () => {
  return await getSessionPayload()
})
