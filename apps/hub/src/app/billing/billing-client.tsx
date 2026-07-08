'use client'

import { useState } from 'react'

interface Sub {
  id: string
  app_slug: string
  app_name: string
  status: string
  seats: number
  assigned: number
  trial_ends_at: string | null
  current_period_end: string | null
}
interface CatalogueApp {
  slug: string
  name: string
  one_liner: string
  prices: { id: string; billing_interval: string; unit_amount_pence: number }[]
  subscribed: boolean
}

function pounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`
}

export function BillingClient({
  isAdmin,
  subscriptions,
  catalogue,
}: {
  isAdmin: boolean
  subscriptions: Sub[]
  catalogue: CatalogueApp[]
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({})

  async function go(url: string, body?: Record<string, unknown>) {
    setBusy(true)
    setError('')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) {
      window.location.href = data.url
    } else {
      setError(data.message ?? 'Billing is not available right now.')
    }
  }

  const statusBadge: Record<string, string> = {
    active: 'ok',
    trialing: 'gold',
    past_due: 'danger',
    cancelled: 'grey',
  }

  return (
    <>
      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <h2>Subscriptions</h2>
        {subscriptions.length === 0 ? (
          <div className="empty">
            <h3>No subscriptions yet</h3>
            <p>Start below, or begin with a free 14-day trial from the launcher.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="plinth">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Status</th>
                  <th>Seats</th>
                  <th>Renews / ends</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.app_name}</td>
                    <td>
                      <span className={`badge ${statusBadge[s.status] ?? ''}`}>{s.status}</span>
                    </td>
                    <td>
                      {s.assigned} of {s.seats} assigned
                    </td>
                    <td>
                      {s.status === 'trialing' && s.trial_ends_at
                        ? `Trial ends ${new Date(s.trial_ends_at).toLocaleDateString('en-GB')}`
                        : s.current_period_end
                          ? new Date(s.current_period_end).toLocaleDateString('en-GB')
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isAdmin && (
          <p style={{ marginTop: '1rem' }}>
            <button className="btn navy" disabled={busy} onClick={() => go('/api/billing/portal')}>
              Manage payment details &amp; invoices
            </button>{' '}
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Invoices, payment methods and cancellations live in the Stripe portal.
            </span>
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <h2>Add apps</h2>
          {catalogue.filter((c) => !c.subscribed && c.prices.length > 0).length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Everything with a published price is already on your plan.
            </p>
          ) : (
            catalogue
              .filter((c) => !c.subscribed && c.prices.length > 0)
              .map((app) => (
                <div key={app.slug} className="form-row" style={{ marginBottom: '1rem' }}>
                  <div style={{ flex: 2 }}>
                    <strong>{app.name}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{app.one_liner}</div>
                  </div>
                  <div className="form-field" style={{ maxWidth: 110 }}>
                    <label>Seats</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={seatCounts[app.slug] ?? 1}
                      onChange={(e) =>
                        setSeatCounts({ ...seatCounts, [app.slug]: Number(e.target.value) })
                      }
                    />
                  </div>
                  {app.prices.map((p) => (
                    <button
                      key={p.id}
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        go('/api/billing/checkout', {
                          app_slug: app.slug,
                          price_id: p.id,
                          seats: seatCounts[app.slug] ?? 1,
                        })
                      }
                    >
                      {pounds(p.unit_amount_pence)}/{p.billing_interval === 'month' ? 'mo' : 'yr'} per seat
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </>
  )
}
