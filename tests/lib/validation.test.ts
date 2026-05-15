import { describe, it, expect } from 'vitest'
import {
  isUuid,
  isValidOrderStatusTransition,
  isValidWaitMinutes,
  ALL_ORDER_STATUSES,
  VALID_WAIT_MINUTES,
  VALID_ORDER_TRANSITIONS,
} from '@/lib/validation'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

// ---------------------------------------------------------------------------
// isUuid
// ---------------------------------------------------------------------------
describe('isUuid', () => {
  it('accepts well-formed UUIDs (lowercase)', () => {
    expect(isUuid(UUID_A)).toBe(true)
    expect(isUuid(UUID_B)).toBe(true)
  })

  it('accepts uppercase UUIDs', () => {
    expect(isUuid('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA')).toBe(true)
  })

  it.each([
    ['empty string', ''],
    ['plain string', 'not-a-uuid'],
    ['too short', '11111111-1111-1111-1111'],
    ['too long', '11111111-1111-1111-1111-1111111111111'],
    ['underscore delimiters', '11111111_1111_4111_8111_111111111111'],
    ['null', null],
    ['undefined', undefined],
    ['number', 123],
    ['object', {}],
    ['array', []],
  ])('rejects %s', (_label, v) => {
    expect(isUuid(v)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isValidOrderStatusTransition
// ---------------------------------------------------------------------------
describe('isValidOrderStatusTransition', () => {
  // 仕様書 §14.2 に定義された許可遷移のホワイトリスト
  const allowed: Array<[string, string]> = [
    ['paid',      'accepted'],
    ['paid',      'cancelled'],
    ['accepted',  'preparing'],
    ['accepted',  'ready'],
    ['accepted',  'cancelled'],
    ['preparing', 'ready'],
    ['preparing', 'cancelled'],
    ['ready',     'completed'],
    ['ready',     'no_show'],
  ]

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(isValidOrderStatusTransition(from as never, to as never)).toBe(true)
  })

  it('blocks all transitions out of terminal statuses', () => {
    const terminals = ['completed', 'cancelled', 'refunded', 'no_show'] as const
    for (const terminal of terminals) {
      for (const to of ALL_ORDER_STATUSES) {
        expect(isValidOrderStatusTransition(terminal, to)).toBe(false)
      }
    }
  })

  it('blocks same-status transitions (no-op)', () => {
    for (const s of ALL_ORDER_STATUSES) {
      expect(isValidOrderStatusTransition(s, s)).toBe(false)
    }
  })

  it('blocks backward transitions not in whitelist', () => {
    expect(isValidOrderStatusTransition('ready',    'paid')).toBe(false)
    expect(isValidOrderStatusTransition('accepted', 'paid')).toBe(false)
    expect(isValidOrderStatusTransition('ready',    'accepted')).toBe(false)
  })

  it('covers exactly the allowed set — no hidden extra transitions', () => {
    for (const from of ALL_ORDER_STATUSES) {
      for (const to of ALL_ORDER_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to)
        expect(isValidOrderStatusTransition(from, to)).toBe(expected)
      }
    }
  })

  it('VALID_ORDER_TRANSITIONS covers pending with no allowed targets', () => {
    // pending は Webhook のみが paid に遷移させる — スタッフAPIからは遷移不可
    expect(VALID_ORDER_TRANSITIONS['pending']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// isValidWaitMinutes
// ---------------------------------------------------------------------------
describe('isValidWaitMinutes', () => {
  it.each(VALID_WAIT_MINUTES)('accepts %d', (m) => {
    expect(isValidWaitMinutes(m)).toBe(true)
  })

  it.each([0, 5, 11, 25, 61, -10, 1.5, NaN, Infinity])(
    'rejects %s',
    (v) => {
      expect(isValidWaitMinutes(v)).toBe(false)
    }
  )
})
