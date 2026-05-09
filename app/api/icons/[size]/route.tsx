import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/icons/[size]'>
) {
  const { size: sizeParam } = await ctx.params
  const size = parseInt(sizeParam, 10)

  if (![192, 512].includes(size)) {
    return new Response('Not found', { status: 404 })
  }

  const radius = Math.round(size * 0.2)
  const fontSize = Math.round(size * 0.6)

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: '#f97316',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        m
      </div>
    ),
    { width: size, height: size }
  )
}
