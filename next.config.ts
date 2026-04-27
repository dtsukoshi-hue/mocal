import type { NextConfig } from "next"

// セキュリティヘッダー
// CSP は Stripe / Supabase / Web Push を許可しつつ、その他の外部読み込みを制限する。
// 'unsafe-inline' は Next.js のスタイル/スクリプト埋め込みのため許容（nonce 化は将来対応）。
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_WS = SUPABASE_URL ? SUPABASE_URL.replace(/^https?:\/\//, 'wss://') : ''

const csp = [
  `default-src 'self'`,
  // Stripe.js は js.stripe.com から読み込む
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`,
  // Stripe iframe（決済 UI）
  `frame-src 'self' https://js.stripe.com https://hooks.stripe.com`,
  // Tailwind / Stripe Elements のインラインスタイル
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  // Supabase REST + Realtime（wss）+ Stripe API
  `connect-src 'self' https://api.stripe.com ${SUPABASE_URL} ${SUPABASE_WS}`.trim(),
  `worker-src 'self'`,
  `manifest-src 'self'`,
  // クリックジャッキング対策
  `frame-ancestors 'none'`,
  // form-action は同一オリジンのみ
  `form-action 'self'`,
  `base-uri 'self'`,
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: csp },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
