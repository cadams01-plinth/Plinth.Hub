import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { ACTION_COPY } from '@/lib/error-copy'

export const dynamic = 'force-dynamic'

/**
 * Org audit viewer — SPEC §5: filter by member/action/date, humanised action
 * strings, CSV export, impersonation events visibly badged. Readable by
 * owners and admins (audit_org_read policy).
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; actor?: string; from?: string; to?: string }
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const impersonation = await getActiveImpersonation()

  if (!isAdmin) {
    return (
      <Shell ctx={ctx} active="/audit" impersonation={impersonation}>
        <main className="container">
          <div className="card empty">
            <h3>Owners and admins only</h3>
            <p>The audit log is available to your organisation&apos;s owners and admins.</p>
          </div>
        </main>
      </Shell>
    )
  }

  const supabase = createClient()
  let query = supabase
    .from('audit_log')
    .select('id, occurred_at, actor_user_id, actor_type, action, target_type, target_id, metadata')
    .eq('organisation_id', ctx.organisationId)
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (searchParams.action) query = query.eq('action', searchParams.action)
  if (searchParams.actor) query = query.eq('actor_user_id', searchParams.actor)
  if (searchParams.from) query = query.gte('occurred_at', searchParams.from)
  if (searchParams.to) query = query.lte('occurred_at', `${searchParams.to}T23:59:59Z`)

  const [{ data: rows }, { data: emails }, { data: profiles }] = await Promise.all([
    query,
    supabase.rpc('org_member_emails', { p_org: ctx.organisationId }),
    supabase.from('profiles').select('id, full_name'),
  ])

  const emailMap = new Map(
    ((emails as { user_id: string; email: string }[]) ?? []).map((e) => [e.user_id, e.email]),
  )
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const who = (id: string | null) =>
    id ? (nameMap.get(id) ?? emailMap.get(id) ?? 'Former member') : 'System'

  const exportParams = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  )

  return (
    <Shell ctx={ctx} active="/audit" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>Audit log</h1>
          <a className="btn ghost" href={`/api/audit/export?${exportParams.toString()}`}>
            Export CSV
          </a>
        </div>

        <form className="card form-row" method="get">
          <div className="form-field">
            <label htmlFor="f-action">Action</label>
            <select id="f-action" name="action" defaultValue={searchParams.action ?? ''}>
              <option value="">All actions</option>
              {Object.entries(ACTION_COPY).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ maxWidth: 170 }}>
            <label htmlFor="f-from">From</label>
            <input id="f-from" name="from" type="date" defaultValue={searchParams.from ?? ''} />
          </div>
          <div className="form-field" style={{ maxWidth: 170 }}>
            <label htmlFor="f-to">To</label>
            <input id="f-to" name="to" type="date" defaultValue={searchParams.to ?? ''} />
          </div>
          <button className="btn secondary" type="submit">
            Filter
          </button>
        </form>

        {!rows || rows.length === 0 ? (
          <div className="card empty">
            <h3>Nothing recorded yet</h3>
            <p>Every state change in your organisation is recorded here.</p>
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="plinth">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.occurred_at).toLocaleString('en-GB')}
                    </td>
                    <td>
                      {who(r.actor_user_id)}
                      {r.actor_type === 'super_admin' && (
                        <>
                          {' '}
                          <span className="badge gold">PLINTH SUPPORT</span>
                        </>
                      )}
                      {r.actor_type === 'ai' && (
                        <>
                          {' '}
                          <span className="badge">ASK PLINTH</span>
                        </>
                      )}
                    </td>
                    <td>
                      {ACTION_COPY[r.action] ?? r.action}
                      {r.action.startsWith('impersonation.') && (
                        <>
                          {' '}
                          <span className="badge gold">SUPPORT ACCESS</span>
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {r.target_type ? `${r.target_type}: ${r.target_id}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Shell>
  )
}
