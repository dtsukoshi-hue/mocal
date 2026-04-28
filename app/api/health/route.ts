import { NextResponse } from 'next/server'
import { isRedisRateLimitEnabled } from '@/lib/rate-limit'

// シンプルな liveness 用エンドポイント（Vercel ヘルスチェック・外形監視向け）。
// DB 接続やシークレットを参照しないことで、環境変数欠損時でも応答することを保証。
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    rateLimit: {
      // 値そのものは返さず存在チェックのみ（情報漏洩防止）
      redisEnabled: isRedisRateLimitEnabled(),
      hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    },
  })
}
