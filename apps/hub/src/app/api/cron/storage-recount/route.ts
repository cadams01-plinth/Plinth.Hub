import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronAuthorised } from '@/lib/cron'
import { plinthError } from '@/lib/errors'

/**
 * Storage recount — SPEC §4 cron. Recomputes organisations.storage_used_bytes
 * from document_versions, correcting any drift from the trigger accounting.
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorised(request)) return plinthError('PLINTH_FORBIDDEN')

  const admin = createAdminClient()
  const { data: orgs } = await admin.from('organisations').select('id, storage_used_bytes')

  let corrected = 0
  for (const org of orgs ?? []) {
    const { data: versions } = await admin
      .from('document_versions')
      .select('file_size_bytes')
      .eq('organisation_id', org.id)
    const actual = (versions ?? []).reduce((sum, v) => sum + v.file_size_bytes, 0)
    if (actual !== org.storage_used_bytes) {
      await admin.from('organisations').update({ storage_used_bytes: actual }).eq('id', org.id)
      corrected += 1
      console.warn('storage drift corrected', org.id, org.storage_used_bytes, '→', actual)
    }
  }
  return NextResponse.json({ ok: true, corrected })
}
