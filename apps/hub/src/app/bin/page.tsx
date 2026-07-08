import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { RestoreButton } from './restore-button'

export const dynamic = 'force-dynamic'

/** Recycle bin — soft-deleted documents; purged after 30 days (AT-15). */
export default async function BinPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, deleted_at, projects(name)')
    .eq('organisation_id', ctx.organisationId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/projects" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>Recycle bin</h1>
        </div>
        <p style={{ color: 'var(--muted)' }}>
          Deleted documents are kept for 30 days, then purged permanently.
          {isAdmin ? ' Restoring is instant.' : ' Ask an owner or admin to restore.'}
        </p>
        {!docs || docs.length === 0 ? (
          <div className="card empty">
            <h3>The bin is empty</h3>
            <p>Deleted documents will appear here for 30 days.</p>
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="plinth">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Project</th>
                  <th>Deleted</th>
                  <th>Purges</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const deleted = new Date(d.deleted_at as string)
                  const purge = new Date(deleted.getTime() + 30 * 86400000)
                  return (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{(d.projects as unknown as { name: string })?.name}</td>
                      <td>{deleted.toLocaleDateString('en-GB')}</td>
                      <td>{purge.toLocaleDateString('en-GB')}</td>
                      {isAdmin && (
                        <td>
                          <RestoreButton documentId={d.id} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </Shell>
  )
}
