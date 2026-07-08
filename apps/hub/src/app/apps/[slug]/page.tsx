import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlinthWordmark } from '@/components/PlinthLogo'

export const dynamic = 'force-dynamic'

function pounds(pence: number) {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`
}

/**
 * App detail — public marketing page; also the SPEC §3 failure-UX landing
 * for unentitled launches ("Ask your admin for a seat").
 */
export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { reason?: string }
}) {
  const supabase = createClient()
  const { data: app } = await supabase
    .from('apps')
    .select(
      'slug, name, category, one_liner, description, status, app_prices(billing_interval, unit_amount_pence, active)',
    )
    .eq('slug', params.slug)
    .neq('status', 'hidden')
    .maybeSingle()
  if (!app) notFound()

  const prices = (
    (app.app_prices as { billing_interval: string; unit_amount_pence: number; active: boolean }[]) ??
    []
  ).filter((p) => p.active)

  return (
    <>
      <header className="titleblock">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <nav className="meta">
          <Link href="/apps">All apps</Link>
          {' · '}
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <main className="container">
        {searchParams.reason === 'seat_needed' && (
          <div className="notice warn">
            You don&apos;t have a seat for {app.name} yet — ask your admin for one,
            or if you are the admin, assign seats under People.
          </div>
        )}
        <span className={`badge ${app.status === 'beta' ? 'beta' : ''}`}>
          {app.status === 'coming_soon' ? 'Coming soon' : app.status === 'beta' ? 'Beta' : app.category}
        </span>
        <h1 style={{ marginTop: '0.5rem' }}>{app.name}</h1>
        <p style={{ fontSize: '1.1rem', maxWidth: '44rem' }}>{app.one_liner}</p>
        {app.description && (
          <div className="card" style={{ maxWidth: '44rem' }}>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{app.description}</p>
          </div>
        )}
        <div className="card" style={{ maxWidth: '44rem', marginTop: '1rem' }}>
          <h2>Pricing</h2>
          {prices.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              {app.status === 'coming_soon'
                ? 'Pricing will be announced at launch.'
                : 'Priced on request while in beta — start a free trial from the Hub.'}
            </p>
          ) : (
            <ul>
              {prices.map((p, i) => (
                <li key={i}>
                  <strong>{pounds(p.unit_amount_pence)}</strong> per seat, per{' '}
                  {p.billing_interval} (ex VAT)
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link className="btn" href="/sign-in">
              Start free trial
            </Link>{' '}
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              14 days, no card required.
            </span>
          </p>
        </div>
      </main>
    </>
  )
}
