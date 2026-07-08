import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import {
  MAX_FILE_BYTES,
  MIME_ALLOWLIST,
  STORAGE_BUCKET,
  projectWriteAccess,
  sniffMime,
} from '@/lib/documents'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  storage_path: z.string().min(10),
  version_number: z.number().int().min(1),
  mime_type: z.string().min(3).max(120),
})

const CHECKSUM_LIMIT = 26_214_400 // hash files up to 25 MB; larger: sniff only

/**
 * Upload step 2 — SPEC §4 finalise: verify the object exists, check its true
 * size, sniff content server-side, checksum, commit the version row, bump
 * current_version_id, audit document.uploaded.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const input = parsed.data

  const supabase = createClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('id, project_id, organisation_id, name')
    .eq('id', params.id)
    .maybeSingle()
  if (!doc) return plinthError('PLINTH_VALIDATION', 'Unknown document')
  if (!(await projectWriteAccess(supabase, doc.project_id, ctx.user.id, ctx.role))) {
    return plinthError('PLINTH_FORBIDDEN')
  }

  // Path must belong to this document — the convention is load-bearing.
  const expectedPrefix = `org_${doc.organisation_id}/project_${doc.project_id}/doc_${doc.id}/v${input.version_number}/`
  if (!input.storage_path.startsWith(expectedPrefix)) {
    return plinthError('PLINTH_VALIDATION', 'Storage path mismatch')
  }
  if (!MIME_ALLOWLIST.has(input.mime_type)) {
    return plinthError('PLINTH_FILE_TYPE_BLOCKED')
  }

  const admin = createAdminClient()

  // Verify the object exists and get its true size.
  const dir = input.storage_path.slice(0, input.storage_path.lastIndexOf('/'))
  const filename = input.storage_path.slice(input.storage_path.lastIndexOf('/') + 1)
  const { data: listing } = await admin.storage.from(STORAGE_BUCKET).list(dir)
  const object = (listing ?? []).find((o) => o.name === filename)
  if (!object) return plinthError('PLINTH_VALIDATION', 'Upload not found — try again')
  const size =
    (object.metadata as { size?: number } | null)?.size ??
    (object as { metadata?: { contentLength?: number } }).metadata?.contentLength ??
    0
  if (!size || size > MAX_FILE_BYTES) {
    await admin.storage.from(STORAGE_BUCKET).remove([input.storage_path])
    return plinthError('PLINTH_FILE_TOO_LARGE')
  }

  // Server-side sniff on the first bytes (and checksum for modest files).
  const { data: signed } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(input.storage_path, 60)
  if (!signed) return plinthError('PLINTH_VALIDATION', 'Could not read the upload')

  let checksum: string | null = null
  try {
    const headRes = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-4095' } })
    const head = new Uint8Array(await headRes.arrayBuffer())
    const sniffError = sniffMime(head, input.mime_type)
    if (sniffError) {
      await admin.storage.from(STORAGE_BUCKET).remove([input.storage_path])
      return plinthError('PLINTH_FILE_TYPE_BLOCKED', sniffError)
    }
    if (size <= CHECKSUM_LIMIT) {
      const fullRes = await fetch(signed.signedUrl)
      const buf = Buffer.from(await fullRes.arrayBuffer())
      checksum = createHash('sha256').update(buf).digest('hex')
    }
  } catch (err) {
    console.error('finalise sniff failed', err)
    return plinthError('PLINTH_VALIDATION', 'Could not verify the upload')
  }

  // Quota re-check against the true size before committing.
  const { data: org } = await admin
    .from('organisations')
    .select('storage_used_bytes, storage_quota_bytes')
    .eq('id', doc.organisation_id)
    .single()
  if (!org || org.storage_used_bytes + size > org.storage_quota_bytes) {
    await admin.storage.from(STORAGE_BUCKET).remove([input.storage_path])
    return plinthError('PLINTH_QUOTA_EXCEEDED')
  }

  const { data: version, error } = await admin
    .from('document_versions')
    .insert({
      document_id: doc.id,
      organisation_id: doc.organisation_id,
      version_number: input.version_number,
      storage_path: input.storage_path,
      file_size_bytes: size,
      mime_type: input.mime_type,
      checksum_sha256: checksum,
      uploaded_by: ctx.user.id,
    })
    .select('id, version_number')
    .single()
  if (error || !version) {
    return plinthError('PLINTH_VALIDATION', 'Version already committed or invalid')
  }

  await admin
    .from('documents')
    .update({ current_version_id: version.id })
    .eq('id', doc.id)

  await logAudit({
    organisationId: doc.organisation_id,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'document.uploaded',
    targetType: 'document',
    targetId: doc.id,
    metadata: { version: version.version_number, size_bytes: size, mime: input.mime_type },
  })

  return NextResponse.json({ version_id: version.id, version_number: version.version_number }, { status: 201 })
}
