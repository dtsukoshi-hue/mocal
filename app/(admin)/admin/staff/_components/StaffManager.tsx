'use client'

import { useEffect, useState } from 'react'

interface Staff {
  id: string
  email: string
  role: 'owner' | 'staff'
  created_at: string
}

export default function StaffManager() {
  const [list, setList] = useState<Staff[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [pwForId, setPwForId] = useState<string | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/staff')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '読み込みに失敗しました')
        setList([])
        return
      }
      const data = (await res.json()) as { staff: Staff[] }
      setList(data.staff)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  async function addStaff() {
    clearMessages()
    setActionLoading('add')
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail, password: addPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? '追加に失敗しました')
        return
      }
      setSuccess(`${addEmail} を追加しました`)
      setAddEmail('')
      setAddPassword('')
      setShowAdd(false)
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function deleteStaff(id: string, email: string) {
    if (!confirm(`${email} を削除しますか？`)) return
    clearMessages()
    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? '削除に失敗しました')
        return
      }
      setSuccess(`${email} を削除しました`)
      await load()
    } finally {
      setActionLoading(null)
    }
  }

  async function changePassword(id: string, email: string) {
    clearMessages()
    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwValue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'パスワード変更に失敗しました')
        return
      }
      setSuccess(`${email} のパスワードを変更しました`)
      setPwForId(null)
      setPwValue('')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-2 rounded-lg">{success}</div>
      )}

      {/* 追加フォーム */}
      {showAdd ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">スタッフを追加</h2>
          <input
            type="email"
            placeholder="メールアドレス"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            autoComplete="off"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <input
            type="password"
            placeholder="パスワード（8文字以上）"
            value={addPassword}
            onChange={(e) => setAddPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={addStaff}
              disabled={actionLoading === 'add' || !addEmail || addPassword.length < 8}
              className="flex-1 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
            >
              {actionLoading === 'add' ? '追加中...' : '追加する'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddEmail(''); setAddPassword('') }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2 rounded-lg"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold py-3 rounded-xl"
        >
          ＋ スタッフを追加
        </button>
      )}

      {/* リスト */}
      {loading && <p className="text-center text-gray-400 text-sm py-6">読み込み中...</p>}

      {!loading && list && list.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-6">
          追加されたスタッフはまだいません
        </p>
      )}

      {list?.map((s) => (
        <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{s.email}</p>
              <p className="text-xs text-gray-400">
                {s.role === 'owner' ? 'オーナー' : 'スタッフ'} ・ 追加日 {new Date(s.created_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
          </div>

          {pwForId === s.id ? (
            <div className="flex gap-2 items-center pt-1">
              <input
                type="password"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="新しいパスワード"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5"
              />
              <button
                onClick={() => changePassword(s.id, s.email)}
                disabled={actionLoading === s.id || pwValue.length < 8}
                className="text-xs bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {actionLoading === s.id ? '保存中' : '保存'}
              </button>
              <button
                onClick={() => { setPwForId(null); setPwValue('') }}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setPwForId(s.id); setPwValue('') }}
                className="flex-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 py-1.5 rounded-lg font-semibold"
              >
                パスワード変更
              </button>
              <button
                onClick={() => deleteStaff(s.id, s.email)}
                disabled={actionLoading === s.id}
                className="flex-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
