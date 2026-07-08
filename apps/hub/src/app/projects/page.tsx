import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { NewProjectForm } from './new-project-form'

export const dynamic = 'force-dynamic'

/** Projects list — RLS shows org admins everything, others their projects. */
export default async function ProjectsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, reference, status, created_at, documents(id)')
    .eq('organisation_id', ctx.organisationId)
    .order('created_at', { ascending: false })

  const canCreate = ['owner', 'admin', 'member'].includes(ctx.role)
  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/projects" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>Projects</h1>
          <Link className="btn ghost" href="/bin">
            Recycle bin
          </Link>
        </div>

        {canCreate && <NewProjectForm />}

        {!projects || projects.length === 0 ? (
          <div className="card empty">
            <h3>No projects yet</h3>
            <p>
              {canCreate
                ? 'Create your first project above — documents and apps hang off it.'
                : 'You have not been added to any projects yet. Ask a project lead or your admin.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap card" style={{ padding: 0 }}>
            <table className="plinth">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Reference</th>
                  <th>Documents</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${p.id}`}>
                        <strong>{p.name}</strong>
                      </Link>
                    </td>
                    <td>{p.reference ?? '—'}</td>
                    <td>{(p.documents as { id: string }[]).length}</td>
                    <td>
                      <span className={`badge ${p.status === 'active' ? 'ok' : 'grey'}`}>{p.status}</span>
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
