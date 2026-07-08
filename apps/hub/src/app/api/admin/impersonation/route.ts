import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { IMPERSONATION_COOKIE } from '@/lib/impersonation'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({
  organisation_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
  consent_reference: z.string().min(2).max(120),
})

/**
 * Start a support impersonation session — SPEC §4 /api/admin/*, AT-11.
 * Requires reason (≥10 chars) + consent reference; row is visible to the
 * org's owners by policy (transparency by design).
 */
export async function POST(request: NextRequest) {
  const sa = await requireSuperAdmin()
  if (!sa) return plinthError('PLINTH_FORBIDDEN')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const admin = createAdminClient()
  const { data: saRow } = await admin
    .from('super_admins')
    .select('id')
    .eq('user_id', sa.userId)
    .single()
  if (!saRow) return plinthError('PLINTH_FORBIDDEN')

  const { data: session, error } = await admin
    .from('impersonation_sessions')
    .insert({
      super_admin_id: saRow.id,
      organisation_id: parsed.data.organisation_id,
      reason: parsed.data.reason,
      consent_reference: parsed.data.consent_reference,
    })
    .select('id')
    .single()
  if (error || !session) return plinthError('PLINTH_VALIDATION', 'Could not start the session')

  await logAudit({
    organisationId: parsed.data.organisation_id,
    actorUserId: sa.userId,
    actorType: 'super_admin',
    action: 'impersonation.started',
    targetType: 'impersonation_session',
    targetId: session.id,
    metadata: { reason: parsed.data.reason, consent_reference: parsed.data.consent_reference },
  })

  const response = NextResponse.json({ session_id: session.id }, { status: 201 })
  response.cookies.set(IMPERSONATION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 4 * 3600, // support sessions expire after 4 hours regardless
  })
  return response
}
