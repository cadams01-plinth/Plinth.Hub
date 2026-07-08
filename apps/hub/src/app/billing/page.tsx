import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatBytes, getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { BillingClient } from './billing-client'

export const dynamic = 'force-dynamic'

/**
 * Billing — SPEC §5: per-app subscription cards (status, seats, renewal),
 * storage meter, portal link, dunning banner states.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string }
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

  const [{ data: subs }, { data: apps }, { data: entitlements }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, app_id, status, seats, trial_ends_at, current_period_end, apps(slug, name)')
      .eq('organisation_id', ctx.organisationId),
    supabase
      .from('apps')
      .select('id, slug, name, one_liner, status, app_prices(id, billing_interval, unit_amount_pence, active)')
      .in('status', ['live', 'beta'])
      .order('sort_order'),
    supabase
      .from('entitlements')
      .select('app_id')
      .eq('organisation_id', ctx.organisationId),
  ])

  const usedPct = Math.min(
    100,
    Math.round((ctx.org.storage_used_bytes / ctx.org.storage_quota_bytes) * 100),
  )
  const impersonation = await getActiveImpersonation()
  const isAdmin = ['owner', 'admin'].includes(ctx.role)

  return (
    <Shell ctx={ctx} active="/billing" impersonation={impersonation}>
      <main className="container">
        {ctx.org.billing_status === 'past_due' && (
          <div className="notice error">
            <strong>Payment overdue.</strong> Update your payment details within 14
            days of the failed payment to keep subscriptions active.
          </div>
        )}
        {searchParams.checkout === 'success' && (
          <div className="notice ok">Subscription confirmed — seats are ready to assign under People.</div>
        )}
        {searchParams.checkout === 'cancelled' && (
          <div className="notice">Checkout cancelled — nothing has been charged.</div>
        )}
        <div className="page-head">
          <h1>Billing</h1>
        </div>

        <div className="card">
          <h2>Storage</h2>
          <p>
            {formatBytes(ctx.org.storage_used_bytes)} of {formatBytes(ctx.org.storage_quota_bytes)} used
          </p>
          <div className="meter">
            <span
              className={usedPct > 95 ? 'danger' : usedPct > 80 ? 'warn' : ''}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        <BillingClient
          isAdmin={isAdmin}
          subscriptions={(subs ?? []).map((s) => ({
            id: s.id,
            app_slug: (s.apps as unknown as { slug: string }).slug,
            app_name: (s.apps as unknown as { name: string }).name,
            status: s.status,
            seats: s.seats,
            assigned: (entitlements ?? []).filter((e) => e.app_id === s.app_id).length,
            trial_ends_at: s.trial_ends_at,
            current_period_end: s.current_period_end,
          }))}
          catalogue={(apps ?? []).map((a) => ({
            slug: a.slug,
            name: a.name,
            one_liner: a.one_liner,
            prices: (
              (a.app_prices as {
                id: string
                billing_interval: string
                unit_amount_pence: number
                active: boolean
              }[]) ?? []
            ).filter((p) => p.active),
            subscribed: (subs ?? []).some(
              (s) => s.app_id === a.id && ['trialing', 'active'].includes(s.status),
            ),
          }))}
        />
      </main>
    </Shell>
  )
}
