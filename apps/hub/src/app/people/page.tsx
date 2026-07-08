import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { PeopleClient } from './people-client'

export const dynamic = 'force-dynamic'

/**
 * People — SPEC §5: members table with role editor, pending invites
 * (resend/revoke), per-app seat matrix ("3 of 5 assigned") with inline assign.
 */
export default async function PeoplePage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

  const [
    { data: members },
    { data: emails },
    { data: profiles },
    { data: invites },
    { data: subs },
    { data: entitlements },
  ] = await Promise.all([
    supabase
      .from('organisation_members')
      .select('user_id, role, created_at')
      .eq('organisation_id', ctx.organisationId)
      .order('created_at'),
    supabase.rpc('org_member_emails', { p_org: ctx.organisationId }),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('invitations')
      .select('id, email, role, expires_at, accepted_at')
      .eq('organisation_id', ctx.organisationId)
      .is('accepted_at', null),
    supabase
      .from('subscriptions')
      .select('app_id, seats, status, apps(slug, name)')
      .eq('organisation_id', ctx.organisationId)
      .in('status', ['trialing', 'active']),
    supabase
      .from('entitlements')
      .select('app_id, user_id')
      .eq('organisation_id', ctx.organisationId),
  ])

  const emailMap = new Map(
    ((emails as { user_id: string; email: string }[]) ?? []).map((e) => [e.user_id, e.email]),
  )
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/people" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>People</h1>
        </div>
        <PeopleClient
          orgId={ctx.organisationId}
          myUserId={ctx.user.id}
          myRole={ctx.role}
          members={(members ?? []).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            email: emailMap.get(m.user_id) ?? '—',
            name: nameMap.get(m.user_id) ?? null,
          }))}
          invites={(invites ?? []).map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expires_at: i.expires_at,
          }))}
          apps={(subs ?? []).map((s) => ({
            app_id: s.app_id,
            slug: (s.apps as unknown as { slug: string }).slug,
            name: (s.apps as unknown as { name: string }).name,
            seats: s.seats,
            status: s.status,
            assigned: (entitlements ?? [])
              .filter((e) => e.app_id === s.app_id)
              .map((e) => e.user_id),
          }))}
        />
      </main>
    </Shell>
  )
}
