import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { formatBytes } from '@/lib/org'
import { PlinthWordmark } from '@/components/PlinthLogo'

export const dynamic = 'force-dynamic'

/** Admin console home — SPEC §14 P5. All reads under the SA's own RLS. */
export default async function AdminPage() {
  const sa = await requireSuperAdmin()
  if (!sa) redirect('/launcher')
  const supabase = createClient()

  const [{ data: orgs }, { data: flags }] = await Promise.all([
    supabase
      .from('organisations')
      .select('id, name, slug, billing_status, storage_used_bytes, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('feature_flags').select('id, key, description, enabled_globally').order('key'),
  ])

  return (
    <>
      <header className="titleblock">
        <Link href="/launcher" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <span className="meta">
          <strong>Admin console</strong> · {sa.email} · <Link href="/launcher">Exit</Link>
        </span>
      </header>
      <main className="container">
        <div className="page-head">
          <h1>Organisations</h1>
          <Link className="btn ghost" href="/admin/catalogue">
            Catalogue
          </Link>
        </div>
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table className="plinth">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Billing</th>
                <th>Storage</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {(orgs ?? []).map((org) => (
                <tr key={org.id}>
                  <td>
                    <Link href={`/admin/orgs/${org.id}`}>
                      <strong>{org.name}</strong>
                    </Link>{' '}
                    <span className="badge grey">{org.slug}</span>
                  </td>
                  <td>
                    <span className={`badge ${org.billing_status === 'past_due' ? 'danger' : ''}`}>
                      {org.billing_status}
                    </span>
                  </td>
                  <td>{formatBytes(org.storage_used_bytes)}</td>
                  <td>{new Date(org.created_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2>Feature flags</h2>
          {(flags ?? []).length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No flags defined yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="plinth">
                <tbody>
                  {(flags ?? []).map((f) => (
                    <tr key={f.id}>
                      <td>
                        <code>{f.key}</code>
                      </td>
                      <td>{f.description}</td>
                      <td>
                        <span className={`badge ${f.enabled_globally ? 'ok' : 'grey'}`}>
                          {f.enabled_globally ? 'on globally' : 'off'}
                        </span>
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
