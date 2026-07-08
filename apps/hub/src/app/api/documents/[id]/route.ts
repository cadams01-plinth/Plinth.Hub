import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { projectWriteAccess } from '@/lib/documents'
import { plinthError } from '@/lib/errors'

/** Soft delete — SPEC §4; restore lives at /restore (O{owner,admin}). */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const supabase = createClient()
  const { data: doc } = await supabase
    .from('documents')
    .select('id, project_id, organisation_id')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!doc) return plinthError('PLINTH_FORBIDDEN')
  if (!(await projectWriteAccess(supabase, doc.project_id, ctx.user.id, ctx.role))) {
    return plinthError('PLINTH_FORBIDDEN')
  }

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', doc.id)
  if (error) return plinthError('PLINTH_FORBIDDEN')

  await logAudit({
    organisationId: doc.organisation_id,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'document.deleted',
    targetType: 'document',
    targetId: doc.id,
  })
  return NextResponse.json({ ok: true })
}
