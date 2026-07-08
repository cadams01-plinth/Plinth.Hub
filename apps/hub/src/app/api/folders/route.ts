import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  project_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
})

/** Create folder — folders_all RLS scopes this to visible projects. */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()
  const { data: folder, error } = await supabase
    .from('folders')
    .insert({
      project_id: parsed.data.project_id,
      organisation_id: ctx.organisationId,
      parent_id: parsed.data.parent_id ?? null,
      name: parsed.data.name,
    })
    .select('id')
    .single()
  if (error || !folder) {
    if (error?.code === '23505') {
      return plinthError('PLINTH_VALIDATION', 'A folder with that name already exists here')
    }
    return plinthError('PLINTH_FORBIDDEN')
  }

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'folder.created',
    targetType: 'folder',
    targetId: folder.id,
    metadata: { project_id: parsed.data.project_id, name: parsed.data.name },
  })
  return NextResponse.json({ folder }, { status: 201 })
}
