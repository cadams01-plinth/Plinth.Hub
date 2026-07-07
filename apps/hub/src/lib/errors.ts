import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

/** Error taxonomy — SPEC §9. Machine-readable codes on every non-2xx. */
export type PlinthErrorCode =
  | 'PLINTH_AUTH_REQUIRED'
  | 'PLINTH_MFA_REQUIRED'
  | 'PLINTH_FORBIDDEN'
  | 'PLINTH_NO_SUBSCRIPTION'
  | 'PLINTH_SEATS_EXHAUSTED'
  | 'PLINTH_QUOTA_EXCEEDED'
  | 'PLINTH_FILE_TYPE_BLOCKED'
  | 'PLINTH_FILE_TOO_LARGE'
  | 'PLINTH_TOKEN_EXPIRED'
  | 'PLINTH_TOKEN_REPLAY'
  | 'PLINTH_APP_NOT_AVAILABLE'
  | 'PLINTH_AI_DISABLED'
  | 'PLINTH_AI_LIMIT'
  | 'PLINTH_RATE_LIMITED'
  | 'PLINTH_VALIDATION'

const DEFAULT_STATUS: Record<PlinthErrorCode, number> = {
  PLINTH_AUTH_REQUIRED: 401,
  PLINTH_MFA_REQUIRED: 401,
  PLINTH_FORBIDDEN: 403,
  PLINTH_NO_SUBSCRIPTION: 403,
  PLINTH_SEATS_EXHAUSTED: 409,
  PLINTH_QUOTA_EXCEEDED: 413,
  PLINTH_FILE_TYPE_BLOCKED: 415,
  PLINTH_FILE_TOO_LARGE: 413,
  PLINTH_TOKEN_EXPIRED: 401,
  PLINTH_TOKEN_REPLAY: 401,
  PLINTH_APP_NOT_AVAILABLE: 404,
  PLINTH_AI_DISABLED: 403,
  PLINTH_AI_LIMIT: 429,
  PLINTH_RATE_LIMITED: 429,
  PLINTH_VALIDATION: 422,
}

export function plinthError(
  code: PlinthErrorCode,
  message?: string,
  extra?: Record<string, unknown>,
  status?: number,
) {
  return NextResponse.json(
    { code, message: message ?? code, ...extra },
    { status: status ?? DEFAULT_STATUS[code] },
  )
}

export function validationError(err: ZodError) {
  return plinthError('PLINTH_VALIDATION', 'Request failed validation', {
    detail: err.flatten(),
  })
}
