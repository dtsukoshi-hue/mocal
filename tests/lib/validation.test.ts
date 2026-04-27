import { describe, it, expect } from 'vitest'
import {
  isUuid,
  normalizeLookupIds,
  isValidOrderStatusTransition,
  ALL_ORDER_STATUSES,
} from '@/lib/validation'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('isUuid', () => {
  it('accepts well-formed UUIDs', () => {
    expect(isUuid(ID_A)).toBe(true)
    expect(isUuid('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA')).toBe(true)
  })
  it.each([
    [''],
    ['not-a-uuid'],
    ['11111111-1111-1111-1111'],         // 短い
    ['11111111-1111-1111-1111-1111111111111'], // 長い
    ['11111111_1111_4111_8111_111111111111'],  // 区切り違い
    [null],
    [undefined],
    [123],
    [{}],
    [[]],
  ])('rejects %s', (v) => {
    expect(isUuid(v)).toBe(false)
  })
})

describe('normalizeLookupIds', () => {
  it('returns dedupe + uuid filter', () => {
    const r = normalizeLookupIds([ID_A, ID_B, ID_A, 'bad', null, ''])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ids.sort()).toEqual([ID_A, ID_B].sort())
    }
  })

  it('rejects non-array input', () => {
    expect(normalizeLookupIds(null)).toEqual({ ok: false, reason: 'not_array' })
    expect(normalizeLookupIds('string')).toEqual({ ok: false, reason: 'not_array' })
    expect(normalizeLookupIds({})).toEqual({ ok: false, reason: 'not_array' })
  })

  it('rejects when too many', () => {
    const ids = Array.from({ length: 21 }, (_, i) =>
      `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111`
    )
    expect(normalizeLookupIds(ids, 20)).toEqual({ ok: false, reason: 'too_many' })
  })

  it('returns empty array for all-invalid input', () => {
    const r = normalizeLookupIds(['a', 'b', null])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ids).toEqual([])
  })

  it('honors the max parameter', () => {
    const r = normalizeLookupIds([ID_A, ID_B], 1)
    expect(r).toEqual({ ok: false, reason: 'too_many' })
  })
})

describe('isValidOrderStatusTransition', () => {
  // 仕様書 6.4 のホワイトリスト
  const allowed: Array<[string, string]> = [
    ['paid', 'accepted'],
    ['paid', 'cancelled'],
    ['accepted', 'preparing'],
    ['accepted', 'ready'],
    ['accepted', 'cancelled'],
    ['preparing', 'ready'],
    ['preparing', 'cancelled'],
    ['ready', 'completed'],
    ['ready', 'no_show'],
  ]

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(isValidOrderStatusTransition(from as never, to as never)).toBe(true)
  })

  it('blocks all unlisted transitions', () => {
    for (const from of ALL_ORDER_STATUSES) {
      for (const to of ALL_ORDER_STATUSES) {
        const isAllowed = allowed.some(([f, t]) => f === from && t === to)
        expect(isValidOrderStatusTransition(from, to)).toBe(isAllowed)
      }
    }
  })

  it('does not allow re-entering the same state', () => {
    for (const s of ALL_ORDER_STATUSES) {
      expect(isValidOrderStatusTransition(s, s)).toBe(false)
    }
  })

  it('does not allow transition out of terminal states', () => {
    for (const terminal of ['completed', 'cancelled', 'refunded', 'no_show'] as const) {
      for (const to of ALL_ORDER_STATUSES) {
        expect(isValidOrderStatusTransition(terminal, to)).toBe(false)
      }
    }
  })
})
