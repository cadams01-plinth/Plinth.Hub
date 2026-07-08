import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext, type OrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'
import { publicEnv } from '@/lib/env'

const bodySchema = z.object({
  conversation_id: z.string().uuid(),
  action_id: z.string().uuid(),
})

type PendingAction = { id: string; name: string; input: Record<string, unknown> }

/**
 * Execute a pending act-tool call — SPEC §7 /api/ai/confirm. Re-validates
 * permission AT EXECUTION TIME (state may have changed), executes under the
 * confirming user's RLS, audits actor_type='ai' + the confirming user id.
 *
 * Single-execution is atomic: a claim row (ai_action_claims, unique action_id)
 * is inserted BEFORE the action runs, so two concurrent confirms cannot both
 * execute. The claim is released if execution fails, so a genuine failure
 * (e.g. seats exhausted) can still be retried.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { conversation_id, action_id } = parsed.data

  const supabase = createClient()

  // Locate the still-pending action in the caller's own conversation (RLS).
  const { data: msgs } = await supabase
    .from('ai_messages')
    .select('id, content')
    .eq('conversation_id', conversation_id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(10)

  let action: PendingAction | undefined
  for (const m of msgs ?? []) {
    const pending = (m.content as { pending_actions?: PendingAction[] })?.pending_actions ?? []
    const found = pending.find((a) => a && a.id === action_id)
    if (found) {
      action = found
      break
    }
  }
  if (!action) return plinthError('PLINTH_VALIDATION', 'That action is no longer pending')

  // Atomic claim — unique(action_id). A 23505 means another request already
  // claimed (and is running or ran) this action.
  const { error: claimErr } = await supabase.from('ai_action_claims').insert({
    conversation_id,
    organisation_id: ctx.organisationId,
    action_id,
    user_id: ctx.user.id,
  })
  if (claimErr) {
    if (claimErr.code === '23505') {
      return plinthError('PLINTH_VALIDATION', 'That action has already run')
    }
    return plinthError('PLINTH_VALIDATION', 'Could not confirm the action')
  }

  const outcome = await executeAction(supabase, ctx, action)

  if (outcome.error) {
    // Release the claim so the user can retry a genuine failure.
    await supabase.from('ai_action_claims').delete().eq('action_id', action_id)
    return outcome.error
  }

  // Success: record the execution in the transcript, meter, audit.
  await supabase.from('ai_messages').insert({
    conversation_id,
    organisation_id: ctx.organisationId,
    role: 'tool',
    content: { action_id, name: action.name, executed: true, result: outcome.result },
  })
  await supabase.rpc('meter_ai_usage', {
    p_org: ctx.organisationId,
    p_tokens_in: 0,
    p_tokens_out: 0,
    p_actions: 1,
  })
  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'ai',
    action: `ai.${action.name}`,
    targetType: 'ai_action',
    targetId: action_id,
    metadata: { input: action.input, result: outcome.result, confirmed_by: ctx.user.id },
  })

  return NextResponse.json({ ok: true, result: outcome.result })
}

/** Run the act-tool. Returns a result on success, or a response on failure. */
async function executeAction(
  supabase: SupabaseClient,
  ctx: OrgContext,
  action: PendingAction,
): Promise<{ result?: Record<string, unknown>; error?: NextResponse }> {
  const input = action.input ?? {}

  switch (action.name) {
    case 'create_project': {
      if (!['owner', 'admin', 'member'].includes(ctx.role)) return { error: plinthError('PLINTH_FORBIDDEN') }
      const name = String(input.name ?? '').slice(0, 160)
      if (name.length < 2) return { error: plinthError('PLINTH_VALIDATION', 'Project name too short') }
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          organisation_id: ctx.organisationId,
          name,
          reference: input.reference ? String(input.reference).slice(0, 60) : null,
          created_by: ctx.user.id,
        })
        .select('id, name')
        .single()
      if (error || !project) return { error: plinthError('PLINTH_FORBIDDEN') }
      await supabase.from('project_members').insert({
        project_id: project.id,
        organisation_id: ctx.organisationId,
        user_id: ctx.user.id,
        role: 'lead',
      })
      return { result: { created: 'project', id: project.id, name: project.name } }
    }
    case 'invite_member': {
      if (!['owner', 'admin'].includes(ctx.role)) return { error: plinthError('PLINTH_FORBIDDEN') }
      const email = String(input.email ?? '').toLowerCase()
      const role = String(input.role ?? 'member')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !['admin', 'member', 'viewer'].includes(role)) {
        return { error: plinthError('PLINTH_VALIDATION', 'Invalid invitation details') }
      }
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert({ organisation_id: ctx.organisationId, email, role, invited_by: ctx.user.id })
        .select('id, token')
        .single()
      if (error || !invite) return { error: plinthError('PLINTH_VALIDATION', 'Could not create the invitation') }
      await sendEmail('invite', email, {
        orgName: ctx.org.name,
        cta: { label: 'Accept invitation', url: `${publicEnv().hubUrl}/invite/${invite.token}` },
      })
      return { result: { invited: email, role } }
    }
    case 'start_trial': {
      const { data, error } = await supabase.rpc('start_trial', {
        p_org: ctx.organisationId,
        p_app_slug: String(input.app_slug ?? ''),
      })
      if (error) {
        return { error: plinthError('PLINTH_VALIDATION', 'Trial could not be started (already used, or not permitted)') }
      }
      const row = Array.isArray(data) ? data[0] : data
      return { result: { trial_started: input.app_slug, trial_ends_at: row?.trial_ends_at } }
    }
    case 'assign_licence': {
      if (!['owner', 'admin'].includes(ctx.role)) return { error: plinthError('PLINTH_FORBIDDEN') }
      const email = String(input.user_email ?? '').toLowerCase()
      const { data: emails } = await supabase.rpc('org_member_emails', { p_org: ctx.organisationId })
      const target = ((emails as { user_id: string; email: string }[]) ?? []).find(
        (e) => e.email.toLowerCase() === email,
      )
      if (!target) return { error: plinthError('PLINTH_VALIDATION', 'No member with that email address') }
      const { data: app } = await supabase
        .from('apps')
        .select('id, slug, name')
        .eq('slug', String(input.app_slug ?? ''))
        .maybeSingle()
      if (!app) return { error: plinthError('PLINTH_APP_NOT_AVAILABLE') }
      const { error } = await supabase.from('entitlements').insert({
        organisation_id: ctx.organisationId,
        app_id: app.id,
        user_id: target.user_id,
        source: 'subscription',
        granted_by: ctx.user.id,
      })
      if (error) {
        if ((error.message ?? '').includes('PLINTH_SEATS_EXHAUSTED')) return { error: plinthError('PLINTH_SEATS_EXHAUSTED') }
        if ((error.message ?? '').includes('PLINTH_NO_SUBSCRIPTION')) return { error: plinthError('PLINTH_NO_SUBSCRIPTION') }
        if (error.code === '23505') return { error: plinthError('PLINTH_VALIDATION', 'They already have a seat') }
        return { error: plinthError('PLINTH_VALIDATION', 'Seat could not be assigned') }
      }
      return { result: { seat_assigned: email, app: app.slug } }
    }
    case 'create_folder': {
      // Bind project to the caller's org (RLS returns null otherwise).
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', String(input.project_id ?? ''))
        .eq('organisation_id', ctx.organisationId)
        .maybeSingle()
      if (!project) return { error: plinthError('PLINTH_FORBIDDEN', 'Unknown project') }
      const { data: folder, error } = await supabase
        .from('folders')
        .insert({
          project_id: project.id,
          organisation_id: ctx.organisationId,
          name: String(input.name ?? '').slice(0, 120),
        })
        .select('id, name')
        .single()
      if (error || !folder) return { error: plinthError('PLINTH_FORBIDDEN', 'Folder could not be created') }
      return { result: { created: 'folder', id: folder.id, name: folder.name } }
    }
    default:
      return { error: plinthError('PLINTH_VALIDATION', 'Unknown action') }
  }
}
