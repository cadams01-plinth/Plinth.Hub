import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const postSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['lead', 'contributor', 'viewer']),
})

/**
 * Project access list — SPEC §4, guard lead or O{owner,admin} (enforced by
 * the pmembers_manage RLS policy; writes run under the caller's context).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()

  // Bind the project to the caller's org BEFORE inserting. The
  // pmembers_manage RLS with-check only validates organisation_id, not that
  // project_id belongs to it — without this, an owner who knows a foreign
  // project UUID could insert themselves into another org's project and gain
  // read access via auth_can_see_project (AT-03). projects_select RLS means
  // this returns null for any project the caller cannot legitimately see.
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', params.id)
    .eq('organisation_id', ctx.organisationId)
    .maybeSingle()
  if (!project) return plinthError('PLINTH_FORBIDDEN')

  // The added user must also belong to the caller's org.
  const { data: targetMember } = await supabase
    .from('organisation_members')
    .select('user_id')
    .eq('organisation_id', ctx.organisationId)
    .eq('user_id', parsed.data.user_id)
    .maybeSingle()
  if (!targetMember) return plinthError('PLINTH_VALIDATION', 'That person is not in this organisation')

  const { error } = await supabase.from('project_members').upsert(
    {
      project_id: params.id,
      organisation_id: ctx.organisationId,
      user_id: parsed.data.user_id,
      role: parsed.data.role,
    },
    { onConflict: 'project_id,user_id' },
  )
  if (error) return plinthError('PLINTH_FORBIDDEN')

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'project.member_added',
    targetType: 'project',
    targetId: params.id,
    metadata: { user_id: parsed.data.user_id, role: parsed.data.role },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

const deleteSchema = z.object({ user_id: z.string().uuid() })

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()
  const { data: removed, error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', params.id)
    .eq('user_id', parsed.data.user_id)
    .select('id')
  if (error || !removed || removed.length === 0) return plinthError('PLINTH_FORBIDDEN')

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'project.member_removed',
    targetType: 'project',
    targetId: params.id,
    metadata: { user_id: parsed.data.user_id },
  })
  return NextResponse.json({ ok: true })
}
