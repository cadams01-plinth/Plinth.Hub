import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { cronAuthorised } from '@/lib/cron'
import { STORAGE_BUCKET } from '@/lib/documents'
import { plinthError } from '@/lib/errors'

/**
 * Recycle-bin purge — SPEC §4 cron. Documents soft-deleted more than 30
 * days ago are removed permanently: storage objects first, then rows (the
 * version-delete trigger reclaims quota).
 */
export async function POST(request: NextRequest) {
  if (!cronAuthorised(request)) return plinthError('PLINTH_FORBIDDEN')

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: docs } = await admin
    .from('documents')
    .select('id, organisation_id, document_versions(storage_path)')
    .lt('deleted_at', cutoff)
    .limit(200)

  let purged = 0
  for (const doc of docs ?? []) {
    const paths = (doc.document_versions as { storage_path: string }[]).map((v) => v.storage_path)
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from(STORAGE_BUCKET).remove(paths)
      if (storageError) {
        console.error('purge: storage removal failed, skipping doc', doc.id, storageError)
        continue
      }
    }
    const { error } = await admin.from('documents').delete().eq('id', doc.id)
    if (!error) {
      purged += 1
      await logAudit({
        organisationId: doc.organisation_id,
        actorUserId: null,
        actorType: 'system',
        action: 'document.purged',
        targetType: 'document',
        targetId: doc.id,
      })
    }
  }
  return NextResponse.json({ ok: true, purged })
}
