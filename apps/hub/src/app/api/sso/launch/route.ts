import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { mintPlt } from '@/lib/sso/plt'
import { publicEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * SSO launch — SPEC §3 flow.
 * Tile click → verify session → app live/beta → user entitled (or super
 * admin) → mint PLT → audit sso.launch → 302 to {redirect_url}#token={PLT}.
 * The token travels in the FRAGMENT so it never reaches server logs.
 */
export async function GET(request: NextRequest) {
  const { hubUrl } = publicEnv()
  const slug = request.nextUrl.searchParams.get('app') ?? ''
  const requestedRedirect = request.nextUrl.searchParams.get('redirect')

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(
      `${hubUrl}/sign-in?next=${encodeURIComponent(`/api/sso/launch?app=${slug}`)}`,
    )
  }

  // App must exist and be launchable. Super admins may launch hidden apps
  // (needed for pre-release checks); everyone else needs live/beta.
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('apps')
    .select('id, slug, name, status, redirect_urls')
    .eq('slug', slug)
    .maybeSingle()

  const { data: superAdmin } = await admin
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const launchable =
    app && (['live', 'beta'].includes(app.status) || (superAdmin && app.status === 'hidden'))
  if (!launchable) {
    return NextResponse.redirect(`${hubUrl}/launcher?error=app_not_available`)
  }

  // Resolve the acting organisation: profile default if the user belongs to
  // it, otherwise their single membership; ambiguous → back to launcher.
  const { data: memberships } = await admin
    .from('organisation_members')
    .select('organisation_id, role, organisations(id, name, billing_status)')
    .eq('user_id', user.id)
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, default_organisation_id')
    .eq('id', user.id)
    .maybeSingle()

  const membership =
    memberships?.find((m) => m.organisation_id === profile?.default_organisation_id) ??
    (memberships?.length === 1 ? memberships[0] : undefined)
  if (!membership) {
    return NextResponse.redirect(`${hubUrl}/launcher?error=choose_organisation`)
  }
  const org = membership.organisations as unknown as { id: string; name: string }

  // Entitlement check (SPEC §3 failure UX: unentitled → app detail page).
  const { data: entitlement } = await admin
    .from('entitlements')
    .select('id, source')
    .eq('organisation_id', membership.organisation_id)
    .eq('app_id', app.id)
    .eq('user_id', user.id)
    .maybeSingle()

  let entitled = Boolean(entitlement) || Boolean(superAdmin)
  if (entitlement && entitlement.source !== 'admin_grant') {
    // Cancelled subscription suspends launch; rows are kept (SPEC §6).
    const { data: sub } = await admin
      .from('subscriptions')
      .select('status')
      .eq('organisation_id', membership.organisation_id)
      .eq('app_id', app.id)
      .maybeSingle()
    if (!sub || !['trialing', 'active'].includes(sub.status)) entitled = Boolean(superAdmin)
  }
  if (!entitled) {
    // SPEC §3 failure UX: unentitled → app detail page with seat guidance.
    return NextResponse.redirect(`${hubUrl}/apps/${app.slug}?reason=seat_needed`)
  }

  // Redirect target: exact match against the app's allowlist only.
  const redirectUrl =
    requestedRedirect && app.redirect_urls.includes(requestedRedirect)
      ? requestedRedirect
      : app.redirect_urls[0]
  if (!redirectUrl) {
    return NextResponse.redirect(`${hubUrl}/launcher?error=app_not_available`)
  }

  const plt = await mintPlt({
    userId: user.id,
    organisationId: membership.organisation_id,
    organisationName: org.name,
    fullName: profile?.full_name ?? user.email ?? 'Unknown',
    email: user.email ?? '',
    role: membership.role as 'owner' | 'admin' | 'member' | 'viewer',
    appSlug: app.slug,
    entitlements: [app.slug],
  })

  await logAudit({
    organisationId: membership.organisation_id,
    actorUserId: user.id,
    actorType: superAdmin && !entitlement ? 'super_admin' : 'user',
    action: 'sso.launch',
    targetType: 'app',
    targetId: app.slug,
  })

  return NextResponse.redirect(`${redirectUrl}#token=${plt}`, 302)
}
