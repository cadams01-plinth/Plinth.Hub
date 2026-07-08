import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorised } from '@/lib/cron'
import { plinthError } from '@/lib/errors'

/**
 * Monthly audit-log partition creation — SPEC §2 (0001). Scheduled for the
 * 25th. The DB function also enables RLS on the new partition (RUNBOOK).
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorised(request)) return plinthError('PLINTH_FORBIDDEN')

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('create_next_audit_partition')
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, partition: data })
}
