import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { plinthError } from '@/lib/errors'
import { verifyPltLocal } from '@/lib/sso/plt'

export const dynamic = 'force-dynamic'

/**
 * Licence re-validation — SPEC §3. Suite apps call at most hourly and before
 * privileged actions, bearing a still-valid PLT. p95 budget: 150 ms — one
 * signature check + two indexed lookups.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('app') ?? ''
  const authz = request.headers.get('authorization') ?? ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return plinthError('PLINTH_AUTH_REQUIRED')

  const claims = await verifyPltLocal(token, slug)
  if (!claims || !claims.sub) return plinthError('PLINTH_TOKEN_EXPIRED')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('apps')
    .select('id, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!app || !['live', 'beta'].includes(app.status)) {
    return plinthError('PLINTH_APP_NOT_AVAILABLE')
  }

  const orgId = claims.org as string
  const [{ data: entitlement }, { data: sub }] = await Promise.all([
    admin
      .from('entitlements')
      .select('id, source')
      .eq('organisation_id', orgId)
      .eq('app_id', app.id)
      .eq('user_id', claims.sub)
      .maybeSingle(),
    admin
      .from('subscriptions')
      .select('status, seats')
      .eq('organisation_id', orgId)
      .eq('app_id', app.id)
      .maybeSingle(),
  ])

  const subActive = sub && ['trialing', 'active'].includes(sub.status)
  const entitled = Boolean(
    entitlement && (entitlement.source === 'admin_grant' || subActive),
  )

  if (!entitled) {
    return NextResponse.json(
      {
        valid: true,
        entitled: false,
        reason: entitlement ? 'subscription_inactive' : 'seat_unassigned',
      },
      { status: 403 },
    )
  }

  return NextResponse.json({
    valid: true,
    entitled: true,
    role: claims.role,
    seats_state: 'ok',
  })
}
