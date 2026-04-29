import 'server-only'
import bcrypt from 'bcryptjs'
import { createServiceClient } from './supabase-server'

// パスワードポリシー
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
const BCRYPT_COST = 12

export function validatePassword(pw: string): { ok: true } | { ok: false; reason: string } {
  if (typeof pw !== 'string') return { ok: false, reason: 'パスワードが不正です。' }
  if (pw.length < PASSWORD_MIN) {
    return { ok: false, reason: `パスワードは ${PASSWORD_MIN} 文字以上にしてください。` }
  }
  if (pw.length > PASSWORD_MAX) {
    return { ok: false, reason: `パスワードは ${PASSWORD_MAX} 文字以下にしてください。` }
  }
  return { ok: true }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): { ok: true } | { ok: false; reason: string } {
  if (typeof email !== 'string') return { ok: false, reason: 'メールアドレスが不正です。' }
  const trimmed = email.trim().toLowerCase()
  if (!EMAIL_REGEX.test(trimmed)) return { ok: false, reason: 'メールアドレスの形式が不正です。' }
  if (trimmed.length > 254) return { ok: false, reason: 'メールアドレスが長すぎます。' }
  return { ok: true }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

export interface StaffLoginResult {
  ok: true
  storeId: string
  email: string
  role: 'owner' | 'staff'
}

/**
 * staff_accounts テーブルからメール+パスワードで認証する。
 * 成功時: { ok: true, storeId, email, role }
 * 失敗時: null
 */
export async function authenticateStaff(
  email: string,
  password: string
): Promise<StaffLoginResult | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createServiceClient()

  const { data: staff } = await supabase
    .from('staff_accounts')
    .select('id, store_id, email, password_hash, role')
    .eq('email', normalizedEmail)
    .limit(1)
    .maybeSingle()

  if (!staff) {
    // タイミング攻撃対策: 存在しない場合もハッシュ計算時間を消費する
    await bcrypt.compare(password, '$2b$12$invalid.invalid.invalid.invalid.invalid.invalid.invalid')
    return null
  }

  const ok = await verifyPassword(password, staff.password_hash)
  if (!ok) return null

  return {
    ok: true,
    storeId: staff.store_id,
    email: staff.email,
    role: staff.role as 'owner' | 'staff',
  }
}
