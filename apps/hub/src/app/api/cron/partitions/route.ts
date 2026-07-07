import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { plinthError } from '@/lib/errors'

/**
 * Monthly audit-log partition creation — SPEC §2 (0001). Scheduled for the
 * 25th. The DB function also enables RLS on the new partition (RUNBOOK).
 */
export async function POST(request: NextRequest) {
  const { cronSecret } = serverEnv()
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return plinthError('PLINTH_FORBIDDEN')
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('create_next_audit_partition')
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, partition: data })
}
