import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { formatBytes } from '@/lib/org'
import { PlinthWordmark } from '@/components/PlinthLogo'
import { ImpersonateButton } from './impersonate-button'

export const dynamic = 'force-dynamic'

/**
 * Admin org detail — SPEC §5 "the support cockpit": memberships,
 * subscriptions, storage, AI usage, impersonation with consent modal.
 */
export default async function AdminOrgPage({ params }: { params: { id: string } }) {
  const sa = await requireSuperAdmin()
  if (!sa) redirect('/launcher')
  const supabase = createClient()

  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, slug, billing_status, storage_used_bytes, storage_quota_bytes, ai_enabled, mfa_required, created_at')
    .eq('id', params.id)
    .maybeSingle()
  if (!org) notFound()

  const [
    { data: members },
    { data: profiles },
    { data: subs },
    { data: aiUsage },
    { data: impersonations },
  ] = await Promise.all([
    supabase.from('organisation_members').select('user_id, role, created_at').eq('organisation_id', org.id),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('subscriptions')
      .select('id, status, seats, trial_ends_at, current_period_end, apps(name, slug)')
      .eq('organisation_id', org.id),
    supabase
      .from('ai_usage_daily')
      .select('day, tokens_in, tokens_out, actions_executed')
      .eq('organisation_id', org.id)
      .order('day', { ascending: false })
      .limit(14),
    supabase
      .from('impersonation_sessions')
      .select('id, reason, consent_reference, started_at, ended_at')
      .eq('organisation_id', org.id)
      .order('started_at', { ascending: false })
      .limit(10),
  ])
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  return (
    <>
      <header className="titleblock">
        <Link href="/admin" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <span className="meta">
          <strong>Admin</strong> · <Link href="/admin">All organisations</Link>
        </span>
      </header>
      <main className="container">
        <div className="page-head">
          <h1>
            {org.name} <span className="badge grey">{org.slug}</span>
          </h1>
          <ImpersonateButton organisationId={org.id} organisationName={org.name} />
        </div>

        <div className="card">
          <h2>Account</h2>
          <p>
            Billing: <span className="badge">{org.billing_status}</span> · Storage:{' '}
            {formatBytes(org.storage_used_bytes)} of {formatBytes(org.storage_quota_bytes)} · AI:{' '}
            <span className={`badge ${org.ai_enabled ? 'ok' : 'grey'}`}>
              {org.ai_enabled ? 'enabled' : 'disabled'}
            </span>{' '}
            · MFA required:{' '}
            <span className={`badge ${org.mfa_required ? 'gold' : 'grey'}`}>
              {org.mfa_required ? 'yes' : 'no'}
            </span>
          </p>
        </div>

        <div className="card">
          <h2>Members ({(members ?? []).length})</h2>
          <div className="table-wrap">
            <table className="plinth">
              <tbody>
                {(members ?? []).map((m) => (
                  <tr key={m.user_id}>
                    <td>{names.get(m.user_id) ?? m.user_id}</td>
                    <td>
                      <span className={`badge ${m.role === 'owner' ? 'gold' : ''}`}>{m.role}</span>
                    </td>
                    <td>{new Date(m.created_at).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Subscriptions</h2>
          {(subs ?? []).length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>None.</p>
          ) : (
            <div className="table-wrap">
              <table className="plinth">
                <tbody>
                  {(subs ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{(s.apps as unknown as { name: string })?.name}</td>
                      <td>
                        <span className="badge">{s.status}</span>
                      </td>
                      <td>{s.seats} seats</td>
                      <td>
                        {s.trial_ends_at
                          ? `trial ends ${new Date(s.trial_ends_at).toLocaleDateString('en-GB')}`
                          : s.current_period_end
                            ? `renews ${new Date(s.current_period_end).toLocaleDateString('en-GB')}`
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Ask Plinth usage (last 14 days)</h2>
          {(aiUsage ?? []).length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No usage.</p>
          ) : (
            <div className="table-wrap">
              <table className="plinth">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Tokens in</th>
                    <th>Tokens out</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(aiUsage ?? []).map((u) => (
                    <tr key={u.day}>
                      <td>{new Date(u.day).toLocaleDateString('en-GB')}</td>
                      <td>{u.tokens_in.toLocaleString('en-GB')}</td>
                      <td>{u.tokens_out.toLocaleString('en-GB')}</td>
                      <td>{u.actions_executed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Support access history</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Every session here is also visible to the organisation&apos;s owners — transparency by design.
          </p>
          {(impersonations ?? []).length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Never accessed.</p>
          ) : (
            <div className="table-wrap">
              <table className="plinth">
                <tbody>
                  {(impersonations ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.started_at).toLocaleString('en-GB')}</td>
                      <td>{s.reason}</td>
                      <td>
                        <code>{s.consent_reference}</code>
                      </td>
                      <td>
                        {s.ended_at ? (
                          <span className="badge grey">ended</span>
                        ) : (
                          <span className="badge gold">active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
