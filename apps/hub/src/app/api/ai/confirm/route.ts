import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'
import { publicEnv } from '@/lib/env'

const bodySchema = z.object({
  conversation_id: z.string().uuid(),
  action_id: z.string().uuid(),
})

/**
 * Execute a pending act-tool call — SPEC §7 /api/ai/confirm. Re-validates
 * permission AT EXECUTION TIME (state may have changed), executes under the
 * confirming user's RLS, audits actor_type='ai' + the confirming user id.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { conversation_id, action_id } = parsed.data

  const supabase = createClient()
  // The conversation must be the caller's own (RLS enforces), the action must
  // be pending in it, and must not already have an execution record (the
  // transcript is append-only, so executions live in role='tool' messages).
  const [{ data: msgs }, { data: executions }] = await Promise.all([
    supabase
      .from('ai_messages')
      .select('id, content')
      .eq('conversation_id', conversation_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('ai_messages')
      .select('content')
      .eq('conversation_id', conversation_id)
      .eq('role', 'tool'),
  ])

  const executedIds = new Set(
    (executions ?? [])
      .map((m) => (m.content as { action_id?: string })?.action_id)
      .filter(Boolean),
  )
  if (executedIds.has(action_id)) {
    return plinthError('PLINTH_VALIDATION', 'That action has already run')
  }

  let action: { id: string; name: string; input: Record<string, unknown> } | undefined
  let messageId: string | undefined
  for (const m of msgs ?? []) {
    const pending = (m.content as { pending_actions?: typeof action[] })?.pending_actions ?? []
    const found = pending.find((a) => a && a.id === action_id)
    if (found) {
      action = found as typeof action
      messageId = m.id
      break
    }
  }
  if (!action || !messageId) {
    return plinthError('PLINTH_VALIDATION', 'That action is no longer pending')
  }

  const input = action.input ?? {}
  let result: Record<string, unknown>

  switch (action.name) {
    case 'create_project': {
      if (!['owner', 'admin', 'member'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')
      const name = String(input.name ?? '').slice(0, 160)
      if (name.length < 2) return plinthError('PLINTH_VALIDATION', 'Project name too short')
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
      if (error || !project) return plinthError('PLINTH_FORBIDDEN')
      await supabase.from('project_members').insert({
        project_id: project.id,
        organisation_id: ctx.organisationId,
        user_id: ctx.user.id,
        role: 'lead',
      })
      result = { created: 'project', id: project.id, name: project.name }
      break
    }
    case 'invite_member': {
      if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')
      const email = String(input.email ?? '').toLowerCase()
      const role = String(input.role ?? 'member')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !['admin', 'member', 'viewer'].includes(role)) {
        return plinthError('PLINTH_VALIDATION', 'Invalid invitation details')
      }
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert({ organisation_id: ctx.organisationId, email, role, invited_by: ctx.user.id })
        .select('id, token')
        .single()
      if (error || !invite) return plinthError('PLINTH_VALIDATION', 'Could not create the invitation')
      await sendEmail('invite', email, {
        orgName: ctx.org.name,
        cta: { label: 'Accept invitation', url: `${publicEnv().hubUrl}/invite/${invite.token}` },
      })
      result = { invited: email, role }
      break
    }
    case 'start_trial': {
      const { data, error } = await supabase.rpc('start_trial', {
        p_org: ctx.organisationId,
        p_app_slug: String(input.app_slug ?? ''),
      })
      if (error) {
        return plinthError('PLINTH_VALIDATION', 'Trial could not be started (already used, or not permitted)')
      }
      const row = Array.isArray(data) ? data[0] : data
      result = { trial_started: input.app_slug, trial_ends_at: row?.trial_ends_at }
      break
    }
    case 'assign_licence': {
      if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')
      const email = String(input.user_email ?? '').toLowerCase()
      const { data: emails } = await supabase.rpc('org_member_emails', { p_org: ctx.organisationId })
      const target = ((emails as { user_id: string; email: string }[]) ?? []).find(
        (e) => e.email.toLowerCase() === email,
      )
      if (!target) return plinthError('PLINTH_VALIDATION', 'No member with that email address')
      const { data: app } = await supabase
        .from('apps')
        .select('id, slug, name')
        .eq('slug', String(input.app_slug ?? ''))
        .maybeSingle()
      if (!app) return plinthError('PLINTH_APP_NOT_AVAILABLE')
      const { error } = await supabase.from('entitlements').insert({
        organisation_id: ctx.organisationId,
        app_id: app.id,
        user_id: target.user_id,
        source: 'subscription',
        granted_by: ctx.user.id,
      })
      if (error) {
        if ((error.message ?? '').includes('PLINTH_SEATS_EXHAUSTED')) {
          return plinthError('PLINTH_SEATS_EXHAUSTED')
        }
        if ((error.message ?? '').includes('PLINTH_NO_SUBSCRIPTION')) {
          return plinthError('PLINTH_NO_SUBSCRIPTION')
        }
        return plinthError('PLINTH_VALIDATION', 'Seat could not be assigned')
      }
      result = { seat_assigned: email, app: app.slug }
      break
    }
    case 'create_folder': {
      const { data: folder, error } = await supabase
        .from('folders')
        .insert({
          project_id: String(input.project_id ?? ''),
          organisation_id: ctx.organisationId,
          name: String(input.name ?? '').slice(0, 120),
        })
        .select('id, name')
        .single()
      if (error || !folder) return plinthError('PLINTH_FORBIDDEN', 'Folder could not be created')
      result = { created: 'folder', id: folder.id, name: folder.name }
      break
    }
    default:
      return plinthError('PLINTH_VALIDATION', 'Unknown action')
  }

  // Record the execution (append-only transcript) so the card cannot run twice.
  await supabase.from('ai_messages').insert({
    conversation_id,
    organisation_id: ctx.organisationId,
    role: 'tool',
    content: { action_id, name: action.name, executed: true, result },
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
    metadata: { input, result, confirmed_by: ctx.user.id },
  })

  return NextResponse.json({ ok: true, result })
}
