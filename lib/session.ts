import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7日

export type SessionPayload = {
  email: string
  storeId: string
  role: string
  exp: number
}

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET!
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function createSessionToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(data)
  return `${data}.${sig}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [data, sig] = parts
  const expected = sign(data)
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function setSession(payload: Omit<SessionPayload, 'exp'>): Promise<void> {
  const cookieStore = await cookies()
  const token = createSessionToken({ ...payload, exp: Date.now() + MAX_AGE * 1000 })
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}
