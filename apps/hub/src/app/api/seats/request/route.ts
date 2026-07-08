import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({ app_slug: z.string().min(1) })

/** Seat request from a member — SPEC §5 launcher: "Request seat → notifies admins". */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()
  const [{ data: app }, { data: members }, { data: emails }, { data: profile }] =
    await Promise.all([
      supabase.from('apps').select('name, slug').eq('slug', parsed.data.app_slug).maybeSingle(),
      supabase
        .from('organisation_members')
        .select('user_id, role')
        .eq('organisation_id', ctx.organisationId)
        .in('role', ['owner', 'admin']),
      supabase.rpc('org_member_emails', { p_org: ctx.organisationId }),
      supabase.from('profiles').select('full_name').eq('id', ctx.user.id).maybeSingle(),
    ])
  if (!app) return plinthError('PLINTH_APP_NOT_AVAILABLE')

  const adminIds = new Set((members ?? []).map((m) => m.user_id))
  const adminEmails = ((emails as { user_id: string; email: string }[]) ?? [])
    .filter((e) => adminIds.has(e.user_id))
    .map((e) => e.email)

  if (adminEmails.length > 0) {
    await sendEmail('seat_requested', adminEmails, {
      orgName: ctx.org.name,
      appName: app.name,
      actorName: profile?.full_name ?? ctx.user.email,
    })
  }

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'seat.requested',
    targetType: 'app',
    targetId: app.slug,
  })

  return NextResponse.json({ ok: true })
}
