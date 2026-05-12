import type { NextConfig } from "next"

// セキュリティヘッダー
// CSP は nonce ベースの動的制御が必要なため proxy.ts（middleware）で設定する。
// ここではリクエスト間で変化しない静的なヘッダーのみを設定する。
const securityHeaders = [
  // CSP は proxy.ts で per-request nonce 付きで設定するためここでは省略
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
