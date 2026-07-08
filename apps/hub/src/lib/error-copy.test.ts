import { describe, it, expect } from 'vitest'
import { ERROR_COPY, ACTION_COPY } from './error-copy'

/**
 * SPEC §9: every PLINTH_* code maps to designed copy. Keep this list in sync
 * with the PlinthErrorCode union in errors.ts — a missing entry means an
 * un-designed error surface.
 */
const CODES = [
  'PLINTH_AUTH_REQUIRED',
  'PLINTH_MFA_REQUIRED',
  'PLINTH_FORBIDDEN',
  'PLINTH_NO_SUBSCRIPTION',
  'PLINTH_SEATS_EXHAUSTED',
  'PLINTH_QUOTA_EXCEEDED',
  'PLINTH_FILE_TYPE_BLOCKED',
  'PLINTH_FILE_TOO_LARGE',
  'PLINTH_TOKEN_EXPIRED',
  'PLINTH_TOKEN_REPLAY',
  'PLINTH_APP_NOT_AVAILABLE',
  'PLINTH_AI_DISABLED',
  'PLINTH_AI_LIMIT',
  'PLINTH_RATE_LIMITED',
  'PLINTH_VALIDATION',
]

describe('error-copy (SPEC §9)', () => {
  it('has designed copy for all 15 error codes', () => {
    for (const code of CODES) {
      expect(ERROR_COPY[code], code).toBeTruthy()
      expect(ERROR_COPY[code].title.length).toBeGreaterThan(0)
      expect(ERROR_COPY[code].body.length).toBeGreaterThan(0)
    }
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...CODES].sort())
  })
})

describe('audit action copy (SPEC §5 humanised strings)', () => {
  it('covers the state-changing actions the app emits', () => {
    const emitted = [
      'sso.launch',
      'member.invited',
      'member.joined',
      'seat.assigned',
      'billing.subscription_started',
      'document.uploaded',
      'document.downloaded',
      'impersonation.started',
      'impersonation.ended',
      'ai.create_project',
      'ai.assign_licence',
    ]
    for (const a of emitted) expect(ACTION_COPY[a], a).toBeTruthy()
  })
})
