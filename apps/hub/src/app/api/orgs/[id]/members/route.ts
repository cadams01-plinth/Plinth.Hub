import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'
import { publicEnv } from '@/lib/env'

/**
 * Member management — SPEC §4 /api/orgs/[id]/members, guard O{owner,admin}
 * (enforced by RLS policies members_manage / invitations_admin; every write
 * here runs under the caller's RLS context). Owner transfer is deliberately
 * NOT here — it is a dedicated re-authenticated action.
 */

async function requireAdmin(orgId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: plinthError('PLINTH_AUTH_REQUIRED') as NextResponse }
  const { data: me } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!me || !['owner', 'admin'].includes(me.role)) {
    return { error: plinthError('PLINTH_FORBIDDEN') as NextResponse }
  }
  return { supabase, user, role: me.role as 'owner' | 'admin' }
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
})

/** POST — invite by email. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(params.id)
  if ('error' in guard) return guard.error
  const { supabase, user } = guard

  const parsed = inviteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const email = parsed.data.email.toLowerCase()

  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      organisation_id: params.id,
      email,
      role: parsed.data.role,
      invited_by: user.id,
    })
    .select('id, token')
    .single()
  if (error) {
    if (error.code === '23505') {
      return plinthError('PLINTH_VALIDATION', 'That address already has a pending invitation')
    }
    return plinthError('PLINTH_FORBIDDEN')
  }

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from('organisations').select('name').eq('id', params.id).single(),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  await sendEmail('invite', email, {
    orgName: org?.name,
    actorName: profile?.full_name ?? user.email ?? undefined,
    cta: {
      label: 'Accept invitation',
      url: `${publicEnv().hubUrl}/invite/${invite.token}`,
    },
  })

  await logAudit({
    organisationId: params.id,
    actorUserId: user.id,
    actorType: 'user',
    action: 'member.invited',
    targetType: 'invitation',
    targetId: invite.id,
    metadata: { email, role: parsed.data.role },
  })
  return NextResponse.json({ ok: true }, { status: 201 })
}

const patchSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
})

/** PATCH — change a member's role (never to/from owner here). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(params.id)
  if ('error' in guard) return guard.error
  const { supabase, user } = guard

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const { data: updated, error } = await supabase
    .from('organisation_members')
    .update({ role: parsed.data.role })
    .eq('organisation_id', params.id)
    .eq('user_id', parsed.data.user_id)
    .neq('role', 'owner') // RLS also blocks owner rows; belt and braces
    .select('id')
  if (error || !updated || updated.length === 0) {
    return plinthError('PLINTH_FORBIDDEN', 'Role could not be changed')
  }

  await logAudit({
    organisationId: params.id,
    actorUserId: user.id,
    actorType: 'user',
    action: 'member.role_changed',
    targetType: 'user',
    targetId: parsed.data.user_id,
    metadata: { role: parsed.data.role },
  })
  return NextResponse.json({ ok: true })
}

const deleteSchema = z.object({
  user_id: z.string().uuid().optional(),
  invitation_id: z.string().uuid().optional(),
})

/** DELETE — remove a member, or revoke a pending invitation. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin(params.id)
  if ('error' in guard) return guard.error
  const { supabase, user } = guard

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  if (parsed.data.invitation_id) {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('organisation_id', params.id)
      .eq('id', parsed.data.invitation_id)
    if (error) return plinthError('PLINTH_FORBIDDEN')
    await logAudit({
      organisationId: params.id,
      actorUserId: user.id,
      actorType: 'user',
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: parsed.data.invitation_id,
    })
    return NextResponse.json({ ok: true })
  }

  if (!parsed.data.user_id) {
    return plinthError('PLINTH_VALIDATION', 'user_id or invitation_id required')
  }

  // Their seats go too, freeing capacity (RLS entitlements_manage).
  await supabase
    .from('entitlements')
    .delete()
    .eq('organisation_id', params.id)
    .eq('user_id', parsed.data.user_id)

  const { data: removed, error } = await supabase
    .from('organisation_members')
    .delete()
    .eq('organisation_id', params.id)
    .eq('user_id', parsed.data.user_id)
    .neq('role', 'owner')
    .select('id')
  if (error || !removed || removed.length === 0) {
    return plinthError('PLINTH_FORBIDDEN', 'Member could not be removed')
  }

  await logAudit({
    organisationId: params.id,
    actorUserId: user.id,
    actorType: 'user',
    action: 'member.removed',
    targetType: 'user',
    targetId: parsed.data.user_id,
  })
  return NextResponse.json({ ok: true })
}
