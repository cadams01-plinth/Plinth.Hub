import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  name: z.string().min(2).max(160),
  reference: z.string().max(60).optional(),
  description: z.string().max(2000).optional(),
})

/** Create project — SPEC §4, O{owner,admin,member}; creator becomes lead. */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin', 'member'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      organisation_id: ctx.organisationId,
      name: parsed.data.name,
      reference: parsed.data.reference ?? null,
      description: parsed.data.description ?? '',
      created_by: ctx.user.id,
    })
    .select('id, name')
    .single()
  if (error || !project) return plinthError('PLINTH_FORBIDDEN')

  const { error: pmError } = await supabase.from('project_members').insert({
    project_id: project.id,
    organisation_id: ctx.organisationId,
    user_id: ctx.user.id,
    role: 'lead',
  })
  if (pmError) console.error('project lead insert failed', pmError)

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'project.created',
    targetType: 'project',
    targetId: project.id,
    metadata: { name: project.name },
  })
  return NextResponse.json({ project }, { status: 201 })
}
