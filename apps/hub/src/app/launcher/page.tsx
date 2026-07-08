import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { TileAction } from './tile-action'

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
  searchParams: { seat_needed?: string; error?: string; trial?: string }
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

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
        .eq('organisation_id', ctx.organisationId)
        .eq('user_id', ctx.user.id),
      supabase
        .from('subscriptions')
        .select('app_id, status, seats, trial_ends_at')
        .eq('organisation_id', ctx.organisationId),
    ])

  const entitledAppIds = new Set((entitlements ?? []).map((e) => e.app_id))
  const activeSubs = new Map(
    (subscriptions ?? [])
      .filter((s) => ['trialing', 'active'].includes(s.status))
      .map((s) => [s.app_id, s]),
  )

  function tileState(app: { id: string; status: string }): TileState {
    if (app.status === 'coming_soon') return 'coming_soon'
    if (entitledAppIds.has(app.id) && activeSubs.has(app.id)) return 'launch'
    if (activeSubs.has(app.id)) return 'seat_needed'
    return 'trial_available'
  }

  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/launcher" impersonation={impersonation}>
      <main className="container">
        {searchParams.seat_needed && (
          <div className="notice warn">
            You don&apos;t have a seat for <strong>{searchParams.seat_needed}</strong> yet
            — {isAdmin ? 'assign yourself one under People.' : 'we can let your admin know you need one.'}
          </div>
        )}
        {searchParams.trial === 'started' && (
          <div className="notice ok">Trial started — you have 14 days. Enjoy.</div>
        )}
        {searchParams.error === 'app_not_available' && (
          <div className="notice error">That app isn&apos;t available right now.</div>
        )}
        {searchParams.error === 'choose_organisation' && (
          <div className="notice">Choose an organisation before launching apps.</div>
        )}
        <div className="page-head">
          <h1>Your apps</h1>
        </div>
        {!apps || apps.length === 0 ? (
          <div className="card empty">
            <h3>No apps in the catalogue yet</h3>
            <p>Check back soon — the suite is growing.</p>
          </div>
        ) : (
          <div className="tile-grid">
            {apps.map((app) => {
              const state = tileState(app)
              const trial = activeSubs.get(app.id)
              return (
                <div className="card tile" key={app.id}>
                  <span className={`badge ${app.status === 'beta' ? 'beta' : ''}`}>
                    {app.status === 'beta' ? 'Beta' : app.category}
                  </span>
                  <h3>{app.name}</h3>
                  <p className="one-liner">
                    {app.one_liner}
                    {state === 'launch' && trial?.status === 'trialing' && trial.trial_ends_at && (
                      <>
                        {' '}
                        <span className="badge gold">
                          Trial ends {new Date(trial.trial_ends_at).toLocaleDateString('en-GB')}
                        </span>
                      </>
                    )}
                  </p>
                  {state === 'launch' && (
                    <a className="btn" href={`/api/sso/launch?app=${app.slug}`}>
                      Launch
                    </a>
                  )}
                  {state !== 'launch' && (
                    <TileAction slug={app.slug} state={state} isAdmin={isAdmin} />
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p style={{ marginTop: '2rem' }}>
          <Link href="/apps">Browse the full catalogue</Link>
          {' · '}
          <Link href="/onboarding">Create another organisation</Link>
        </p>
      </main>
    </Shell>
  )
}
