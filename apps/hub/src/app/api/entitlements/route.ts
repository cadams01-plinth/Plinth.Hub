import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  app_slug: z.string().min(1),
  user_id: z.string().uuid(),
})

/**
 * Assign / unassign a seat — SPEC §4, guard O{owner,admin}. Runs under the
 * user's RLS (entitlements_manage policy); the seat-capacity trigger
 * enforces the cap and surfaces PLINTH_* codes.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { app_slug, user_id } = parsed.data

  const supabase = createClient()
  const { data: app } = await supabase
    .from('apps')
    .select('id, name, slug')
    .eq('slug', app_slug)
    .maybeSingle()
  if (!app) return plinthError('PLINTH_APP_NOT_AVAILABLE')

  // Viewers never hold write-capable seats (SPEC §2 role semantics).
  const { data: member } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', ctx.organisationId)
    .eq('user_id', user_id)
    .maybeSingle()
  if (!member) return plinthError('PLINTH_VALIDATION', 'That person is not in this organisation')

  const { error } = await supabase.from('entitlements').insert({
    organisation_id: ctx.organisationId,
    app_id: app.id,
    user_id,
    source: 'subscription',
    granted_by: ctx.user.id,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('PLINTH_SEATS_EXHAUSTED')) {
      return plinthError('PLINTH_SEATS_EXHAUSTED', 'All purchased seats are assigned — add seats or unassign someone')
    }
    if (message.includes('PLINTH_NO_SUBSCRIPTION')) {
      return plinthError('PLINTH_NO_SUBSCRIPTION', 'No active subscription for that app')
    }
    if (error.code === '23505') {
      return plinthError('PLINTH_VALIDATION', 'They already have a seat')
    }
    return plinthError('PLINTH_FORBIDDEN')
  }

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'seat.assigned',
    targetType: 'app',
    targetId: app.slug,
    metadata: { user_id },
  })

  const { data: emails } = await supabase.rpc('org_member_emails', { p_org: ctx.organisationId })
  const target = ((emails as { user_id: string; email: string }[]) ?? []).find(
    (e) => e.user_id === user_id,
  )
  if (target) {
    await sendEmail('seat_assigned', target.email, {
      orgName: ctx.org.name,
      appName: app.name,
    })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { app_slug, user_id } = parsed.data

  const supabase = createClient()
  const { data: app } = await supabase.from('apps').select('id, slug').eq('slug', app_slug).maybeSingle()
  if (!app) return plinthError('PLINTH_APP_NOT_AVAILABLE')

  const { error } = await supabase
    .from('entitlements')
    .delete()
    .eq('organisation_id', ctx.organisationId)
    .eq('app_id', app.id)
    .eq('user_id', user_id)
  if (error) return plinthError('PLINTH_FORBIDDEN')

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'seat.unassigned',
    targetType: 'app',
    targetId: app.slug,
    metadata: { user_id },
  })
  return NextResponse.json({ ok: true })
}
