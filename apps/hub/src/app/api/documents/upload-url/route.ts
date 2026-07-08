import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext } from '@/lib/org'
import {
  MAX_FILE_BYTES,
  MIME_ALLOWLIST,
  STORAGE_BUCKET,
  projectWriteAccess,
  storagePath,
} from '@/lib/documents'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  project_id: z.string().uuid(),
  folder_id: z.string().uuid().nullable().optional(),
  document_id: z.string().uuid().optional(), // present → new version
  filename: z.string().min(1).max(255),
  size_bytes: z.number().int().min(1),
  mime_type: z.string().min(3).max(120),
})

/**
 * Upload step 1 — SPEC §4: check permission, quota and MIME allowlist, then
 * mint a signed upload URL (600 s). The version row is only committed by
 * finalise, after the server-side sniff.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const input = parsed.data

  if (input.size_bytes > MAX_FILE_BYTES) {
    return plinthError('PLINTH_FILE_TOO_LARGE', 'Files can be up to 500 MB')
  }
  if (!MIME_ALLOWLIST.has(input.mime_type)) {
    return plinthError('PLINTH_FILE_TYPE_BLOCKED', 'That file type is not accepted')
  }

  const supabase = createClient()
  if (!(await projectWriteAccess(supabase, input.project_id, ctx.user.id, ctx.role))) {
    return plinthError('PLINTH_FORBIDDEN', 'You have read-only access to this project')
  }

  // Tenancy is the PROJECT's org, not the caller's current context — a
  // project member may act on a project in an org that isn't their active
  // one. Stamping ctx.organisationId would misfile the document and bill the
  // wrong quota. RLS makes this select return null if the project isn't
  // visible to the caller.
  const { data: project } = await supabase
    .from('projects')
    .select('organisation_id')
    .eq('id', input.project_id)
    .maybeSingle()
  if (!project) return plinthError('PLINTH_FORBIDDEN')
  const orgId = project.organisation_id

  // Quota (SPEC §4): current usage + incoming file must fit.
  const { data: org } = await supabase
    .from('organisations')
    .select('storage_used_bytes, storage_quota_bytes')
    .eq('id', orgId)
    .single()
  if (!org || org.storage_used_bytes + input.size_bytes > org.storage_quota_bytes) {
    return plinthError('PLINTH_QUOTA_EXCEEDED', 'This upload would exceed your storage quota')
  }

  // New document, or new version of an existing one (user RLS enforces both).
  let documentId = input.document_id
  let nextVersion = 1
  if (documentId) {
    const { data: doc } = await supabase
      .from('documents')
      .select('id, project_id, document_versions(version_number)')
      .eq('id', documentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!doc || doc.project_id !== input.project_id) {
      return plinthError('PLINTH_VALIDATION', 'Unknown document')
    }
    nextVersion =
      Math.max(0, ...(doc.document_versions as { version_number: number }[]).map((v) => v.version_number)) + 1
  } else {
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        project_id: input.project_id,
        organisation_id: orgId,
        folder_id: input.folder_id ?? null,
        name: input.filename,
        created_by: ctx.user.id,
      })
      .select('id')
      .single()
    if (error || !doc) return plinthError('PLINTH_FORBIDDEN')
    documentId = doc.id as string
  }

  const path = storagePath(orgId, input.project_id, documentId!, nextVersion, input.filename)

  // Signed upload URL (600 s) — service role, quarantined path.
  const admin = createAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path)
  if (signError || !signed) {
    return plinthError('PLINTH_VALIDATION', 'Could not prepare the upload')
  }

  return NextResponse.json({
    document_id: documentId,
    version_number: nextVersion,
    storage_path: path,
    token: signed.token,
    signed_url: signed.signedUrl,
  })
}
