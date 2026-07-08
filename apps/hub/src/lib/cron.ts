import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'

/** Constant-time bearer comparison — avoids leaking the secret via timing. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Shared CRON_SECRET guard for /api/cron/* (SPEC §4). */
export function cronAuthorised(request: NextRequest): boolean {
  const { cronSecret } = serverEnv()
  if (!cronSecret) return false
  const header = request.headers.get('authorization') ?? ''
  return safeEqual(header, `Bearer ${cronSecret}`)
}
