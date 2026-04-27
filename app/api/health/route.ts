import { NextResponse } from 'next/server'

// シンプルな liveness 用エンドポイント（Vercel ヘルスチェック・外形監視向け）。
// DB 接続やシークレットを参照しないことで、環境変数欠損時でも応答することを保証。
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
  })
}
