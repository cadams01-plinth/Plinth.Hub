import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { sendEmail } from '@/lib/email'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({ app_slug: z.string().min(1) })

/**
 * Start a 14-day trial — SPEC §4. O{owner,admin,member*}: the start_trial
 * RPC (security definer) enforces roles + the member self-start org setting,
 * creates subscription + first seat atomically, and writes the audit row.
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const supabase = createClient()
  const { data, error } = await supabase.rpc('start_trial', {
    p_org: ctx.organisationId,
    p_app_slug: parsed.data.app_slug,
  })

  if (error) {
    const message = error.message ?? ''
    if (message.includes('PLINTH_APP_NOT_AVAILABLE')) return plinthError('PLINTH_APP_NOT_AVAILABLE')
    if (message.includes('PLINTH_FORBIDDEN')) {
      return plinthError('PLINTH_FORBIDDEN', 'Trials are started by your admins in this organisation')
    }
    if (message.includes('PLINTH_VALIDATION')) {
      return plinthError('PLINTH_VALIDATION', 'This organisation has already used its trial for that app')
    }
    return plinthError('PLINTH_VALIDATION', 'Could not start the trial')
  }

  const { data: app } = await supabase
    .from('apps')
    .select('name')
    .eq('slug', parsed.data.app_slug)
    .maybeSingle()
  await sendEmail('trial_started', ctx.user.email, {
    orgName: ctx.org.name,
    appName: app?.name ?? parsed.data.app_slug,
  })

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ trial_ends_at: row?.trial_ends_at }, { status: 201 })
}
