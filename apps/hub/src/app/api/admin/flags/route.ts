import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.union([
  z.object({
    key: z.string().min(2).max(80),
    description: z.string().max(400).optional(),
    enabled_globally: z.boolean(),
  }),
  z.object({
    flag_id: z.string().uuid(),
    organisation_id: z.string().uuid(),
    enabled: z.boolean(),
  }),
])

/** Feature flags — global upsert or per-org override (SA only, RLS-backed). */
export async function POST(request: NextRequest) {
  const sa = await requireSuperAdmin()
  if (!sa) return plinthError('PLINTH_FORBIDDEN')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const supabase = createClient()

  if ('key' in parsed.data) {
    const { error } = await supabase
      .from('feature_flags')
      .upsert(
        {
          key: parsed.data.key,
          description: parsed.data.description ?? '',
          enabled_globally: parsed.data.enabled_globally,
        },
        { onConflict: 'key' },
      )
    if (error) return plinthError('PLINTH_VALIDATION', error.message)
    await logAudit({
      organisationId: null,
      actorUserId: sa.userId,
      actorType: 'super_admin',
      action: 'flag.updated',
      targetType: 'feature_flag',
      targetId: parsed.data.key,
      metadata: { enabled_globally: parsed.data.enabled_globally },
    })
  } else {
    const { error } = await supabase.from('organisation_feature_flags').upsert({
      flag_id: parsed.data.flag_id,
      organisation_id: parsed.data.organisation_id,
      enabled: parsed.data.enabled,
    })
    if (error) return plinthError('PLINTH_VALIDATION', error.message)
    await logAudit({
      organisationId: parsed.data.organisation_id,
      actorUserId: sa.userId,
      actorType: 'super_admin',
      action: 'flag.org_override',
      targetType: 'feature_flag',
      targetId: parsed.data.flag_id,
      metadata: { enabled: parsed.data.enabled },
    })
  }
  return NextResponse.json({ ok: true })
}
