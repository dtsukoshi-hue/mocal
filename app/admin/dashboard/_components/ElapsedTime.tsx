'use client'

import { useState, useEffect } from 'react'

interface Props {
  createdAt: string
  /** 警告色を付ける閾値（分）: paid 注文がこの時間以上経過したら赤表示 */
  warnAfterMinutes?: number
}

function formatElapsed(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (diff < 60) return `${diff}秒`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}分`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return remMins > 0 ? `${hours}時間${remMins}分` : `${hours}時間`
}

function getMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

export default function ElapsedTime({ createdAt, warnAfterMinutes }: Props) {
  // 初期値は null（サーバーとクライアントで Date.now() が異なるため SSR では描画しない）
  const [elapsed, setElapsed] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(0)

  useEffect(() => {
    const update = () => {
      setElapsed(formatElapsed(createdAt))
      setMinutes(getMinutes(createdAt))
    }
    // 初回計算は microtask に回して effect 同期実行を避ける
    // (react-hooks/set-state-in-effect 回避)
    queueMicrotask(update)
    // 10秒ごとに更新（秒単位表示の精度を保ちつつ過剰なレンダリングを避ける）
    const interval = setInterval(update, 10_000)
    return () => clearInterval(interval)
  }, [createdAt])

  // マウント前はサーバー HTML と一致させるため何も描画しない
  if (elapsed === null) return null

  const isWarning = warnAfterMinutes !== undefined && minutes >= warnAfterMinutes

  return (
    <span className={isWarning ? 'text-red-500 font-medium' : 'text-gray-400'}>
      {elapsed}経過
    </span>
  )
}
