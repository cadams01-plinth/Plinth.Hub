import 'server-only'
import type { NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'

/** Shared CRON_SECRET guard for /api/cron/* (SPEC §4). */
export function cronAuthorised(request: NextRequest): boolean {
  const { cronSecret } = serverEnv()
  return Boolean(cronSecret) && request.headers.get('authorization') === `Bearer ${cronSecret}`
}
