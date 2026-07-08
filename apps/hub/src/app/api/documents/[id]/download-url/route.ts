import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { STORAGE_BUCKET } from '@/lib/documents'
import { plinthError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/**
 * Signed download URL (120 s) — SPEC §4, project read guard via RLS; audits
 * document.downloaded. ?version= selects a specific version.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const supabase = createClient()
  // Visibility via RLS: if the user can't see the project, this returns null.
  const { data: doc } = await supabase
    .from('documents')
    .select('id, name, organisation_id, current_version_id, document_versions(id, version_number, storage_path, mime_type, file_size_bytes)')
    .eq('id', params.id)
    .maybeSingle()
  if (!doc) return plinthError('PLINTH_FORBIDDEN')

  const versions = doc.document_versions as {
    id: string
    version_number: number
    storage_path: string
    mime_type: string
    file_size_bytes: number
  }[]
  const wanted = request.nextUrl.searchParams.get('version')
  const version = wanted
    ? versions.find((v) => String(v.version_number) === wanted)
    : versions.find((v) => v.id === doc.current_version_id) ??
      versions.sort((a, b) => b.version_number - a.version_number)[0]
  if (!version) return plinthError('PLINTH_VALIDATION', 'No uploaded version yet')

  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path, 120, { download: doc.name })
  if (error || !signed) return plinthError('PLINTH_VALIDATION', 'Could not sign the download')

  await logAudit({
    organisationId: doc.organisation_id,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'document.downloaded',
    targetType: 'document',
    targetId: doc.id,
    metadata: { version: version.version_number },
  })

  return NextResponse.json({
    url: signed.signedUrl,
    mime_type: version.mime_type,
    version_number: version.version_number,
    file_size_bytes: version.file_size_bytes,
  })
}
