import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, 'lowercase letters, digits and hyphens'),
})

/**
 * Create organisation + owner membership — SPEC §4 (wizard step 1).
 * Service role by design: org INSERT is closed to clients (SPEC §2, 0002).
 * Stripe customer creation lands with Phase 2 billing.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { name, slug } = parsed.data

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('organisations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (existing) {
    return plinthError('PLINTH_VALIDATION', 'That workspace address is taken', {
      detail: { fieldErrors: { slug: ['already in use'] } },
    })
  }

  const { data: org, error: orgError } = await admin
    .from('organisations')
    .insert({ name, slug })
    .select('id, name, slug')
    .single()
  if (orgError || !org) {
    return plinthError('PLINTH_VALIDATION', 'Could not create organisation')
  }

  const { error: memberError } = await admin
    .from('organisation_members')
    .insert({ organisation_id: org.id, user_id: user.id, role: 'owner' })
  if (memberError) {
    await admin.from('organisations').delete().eq('id', org.id)
    return plinthError('PLINTH_VALIDATION', 'Could not create organisation')
  }

  await admin
    .from('profiles')
    .upsert({ id: user.id, default_organisation_id: org.id }, { onConflict: 'id' })

  await logAudit({
    organisationId: org.id,
    actorUserId: user.id,
    actorType: 'user',
    action: 'organisation.created',
    targetType: 'organisation',
    targetId: org.id,
  })

  return NextResponse.json({ organisation: org }, { status: 201 })
}
