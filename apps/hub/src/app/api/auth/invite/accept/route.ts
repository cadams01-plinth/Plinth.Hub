import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({ token: z.string().min(20) })

/**
 * Invite acceptance — SPEC §4. Resolves by token via service role (never a
 * client select), creates the membership, audits member.joined.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('invitations')
    .select('id, organisation_id, email, role, expires_at, accepted_at')
    .eq('token', parsed.data.token)
    .maybeSingle()

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return plinthError('PLINTH_FORBIDDEN', 'This invitation is no longer valid')
  }
  if (invite.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
    return plinthError('PLINTH_FORBIDDEN', 'This invitation was sent to a different address')
  }

  const { error: memberError } = await admin
    .from('organisation_members')
    .insert({
      organisation_id: invite.organisation_id,
      user_id: user.id,
      role: invite.role,
    })
  if (memberError && memberError.code !== '23505') {
    return plinthError('PLINTH_VALIDATION', 'Could not join organisation')
  }

  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  await logAudit({
    organisationId: invite.organisation_id,
    actorUserId: user.id,
    actorType: 'user',
    action: 'member.joined',
    targetType: 'organisation',
    targetId: invite.organisation_id,
    metadata: { role: invite.role },
  })

  return NextResponse.json({ organisation_id: invite.organisation_id })
}
