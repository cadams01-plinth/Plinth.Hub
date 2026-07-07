import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type TileState = 'launch' | 'trial_available' | 'seat_needed' | 'coming_soon'

/**
 * The launcher — SPEC §5. Tile states: entitled → Launch, trial-available →
 * Start trial, coming soon → Notify me, seat needed → Request seat.
 * All reads run under the user's RLS context.
 */
export default async function LauncherPage({
  searchParams,
}: {
  searchParams: { seat_needed?: string; error?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/launcher')

  const { data: memberships } = await supabase
    .from('organisation_members')
    .select('organisation_id, role, organisations(id, name, billing_status)')
    .eq('user_id', user.id)
  if (!memberships || memberships.length === 0) redirect('/onboarding')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_organisation_id')
    .eq('id', user.id)
    .maybeSingle()
  const membership =
    memberships.find((m) => m.organisation_id === profile?.default_organisation_id) ??
    memberships[0]
  const org = membership.organisations as unknown as {
    id: string
    name: string
    billing_status: string
  }

  const [{ data: apps }, { data: entitlements }, { data: subscriptions }] =
    await Promise.all([
      supabase
        .from('apps')
        .select('id, slug, name, category, one_liner, status, sort_order')
        .neq('status', 'hidden')
        .order('sort_order'),
      supabase
        .from('entitlements')
        .select('app_id')
        .eq('organisation_id', membership.organisation_id)
        .eq('user_id', user.id),
      supabase
        .from('subscriptions')
        .select('app_id, status, seats')
        .eq('organisation_id', membership.organisation_id),
    ])

  const entitledAppIds = new Set((entitlements ?? []).map((e) => e.app_id))
  const activeSubAppIds = new Set(
    (subscriptions ?? [])
      .filter((s) => ['trialing', 'active'].includes(s.status))
      .map((s) => s.app_id),
  )

  function tileState(app: { id: string; status: string }): TileState {
    if (app.status === 'coming_soon') return 'coming_soon'
    if (entitledAppIds.has(app.id) && activeSubAppIds.has(app.id)) return 'launch'
    if (activeSubAppIds.has(app.id)) return 'seat_needed'
    return 'trial_available'
  }

  return (
    <>
      <header className="titleblock">
        <span className="lockup">PLINTH · HUB</span>
        <span className="meta">
          {org.name} · {org.billing_status === 'free' ? 'Free plan' : org.billing_status}
        </span>
      </header>
      <main className="container">
        {searchParams.seat_needed && (
          <div className="notice">
            You don&apos;t have a seat for that app yet — ask your admin for one.
          </div>
        )}
        {searchParams.error === 'app_not_available' && (
          <div className="notice error">That app isn&apos;t available right now.</div>
        )}
        <h1>Your apps</h1>
        {!apps || apps.length === 0 ? (
          <div className="card">
            <p>
              The catalogue is empty — seed it with <code>supabase db reset</code>.
            </p>
          </div>
        ) : (
          <div className="tile-grid">
            {apps.map((app) => {
              const state = tileState(app)
              return (
                <div className="card tile" key={app.id}>
                  <span className={`badge ${app.status === 'beta' ? 'beta' : ''}`}>
                    {app.status === 'beta' ? 'Beta' : app.category}
                  </span>
                  <h3>{app.name}</h3>
                  <p className="one-liner">{app.one_liner}</p>
                  {state === 'launch' && (
                    <a className="btn" href={`/api/sso/launch?app=${app.slug}`}>
                      Launch
                    </a>
                  )}
                  {state === 'trial_available' && (
                    <button className="btn secondary" disabled title="Trials arrive with billing (Phase 2)">
                      Start trial
                    </button>
                  )}
                  {state === 'seat_needed' && (
                    <button className="btn ghost" disabled title="Seat requests arrive with billing (Phase 2)">
                      Request seat
                    </button>
                  )}
                  {state === 'coming_soon' && (
                    <button className="btn ghost" disabled>
                      Coming soon
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p style={{ marginTop: '2rem' }}>
          <Link href="/onboarding">Create another organisation</Link>
        </p>
      </main>
    </>
  )
}
