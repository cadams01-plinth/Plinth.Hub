import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { plinthError } from '@/lib/errors'

/** Restore from the recycle bin — SPEC §4, O{owner,admin}. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')

  const supabase = createClient()
  const { data: restored, error } = await supabase
    .from('documents')
    .update({ deleted_at: null })
    .eq('id', params.id)
    .eq('organisation_id', ctx.organisationId)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error || !restored || restored.length === 0) {
    return plinthError('PLINTH_FORBIDDEN', 'Nothing to restore')
  }

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'document.restored',
    targetType: 'document',
    targetId: params.id,
  })
  return NextResponse.json({ ok: true })
}
