import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'
import { plinthError } from '@/lib/errors'

/**
 * End a support impersonation session — AT-11 transparency leg: org owners
 * get the impersonation_notice email the moment the session ends.
 */
export async function POST(request: NextRequest) {
  const sa = await requireSuperAdmin()
  if (!sa) return plinthError('PLINTH_FORBIDDEN')

  const sessionId = cookies().get(IMPERSONATION_COOKIE)?.value
  const admin = createAdminClient()

  if (sessionId) {
    const { data: session } = await admin
      .from('impersonation_sessions')
      .select('id, organisation_id, consent_reference, ended_at, organisations(name)')
      .eq('id', sessionId)
      .maybeSingle()

    if (session && !session.ended_at) {
      await admin
        .from('impersonation_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', session.id)

      await logAudit({
        organisationId: session.organisation_id,
        actorUserId: sa.userId,
        actorType: 'super_admin',
        action: 'impersonation.ended',
        targetType: 'impersonation_session',
        targetId: session.id,
      })

      const owners = await ownerEmails(admin, session.organisation_id)
      if (owners.length) {
        await sendEmail('impersonation_notice', owners, {
          orgName: (session.organisations as unknown as { name: string })?.name,
          detail: session.consent_reference,
        })
      }
    }
  }

  const response = NextResponse.redirect(new URL('/admin', request.url), 303)
  response.cookies.delete(IMPERSONATION_COOKIE)
  return response
}

async function ownerEmails(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data: members } = await admin
    .from('organisation_members')
    .select('user_id')
    .eq('organisation_id', orgId)
    .eq('role', 'owner')
  const emails: string[] = []
  for (const m of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(m.user_id)
    if (data.user?.email) emails.push(data.user.email)
  }
  return emails
}
