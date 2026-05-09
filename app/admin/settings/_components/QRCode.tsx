'use client'

import { useEffect, useRef, useState } from 'react'
import QRCodeLib from 'qrcode'

interface Props {
  url: string
  storeName: string
}

export default function QRCode({ url, storeName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    })
  }, [url])

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `mocal-qr-${storeName}.png`
    link.href = canvas.toDataURL('image/png')
    // Firefox はリンクが DOM に存在しないとダウンロードをトリガーしない
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      //
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="rounded-xl border border-gray-100" />
      <div className="flex items-center gap-2 text-xs text-gray-500 text-center break-all max-w-full">
        <span className="truncate">{url}</span>
        <button
          onClick={handleCopyLink}
          className="shrink-0 text-orange-500 hover:text-orange-600 font-medium"
        >
          {copied ? 'コピー済!' : 'コピー'}
        </button>
      </div>
      <button
        onClick={handleDownload}
        className="text-sm text-orange-500 hover:text-orange-600 hover:underline"
      >
        PNG をダウンロード
      </button>
    </div>
  )
}
