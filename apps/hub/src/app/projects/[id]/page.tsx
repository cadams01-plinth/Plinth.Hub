import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { ProjectClient } from './project-client'

export const dynamic = 'force-dynamic'

/** Project workspace: folders, documents, upload, access list. */
export default async function ProjectPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const supabase = createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, reference, description, status, organisation_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!project) notFound()

  const [
    { data: folders },
    { data: documents },
    { data: projectMembers },
    { data: orgMembers },
    { data: emails },
    { data: profiles },
    { data: myMembership },
  ] = await Promise.all([
    supabase.from('folders').select('id, name, parent_id').eq('project_id', project.id).order('name'),
    supabase
      .from('documents')
      .select(
        'id, name, folder_id, updated_at, current_version_id, document_versions(id, version_number, file_size_bytes, mime_type)',
      )
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .order('name'),
    supabase.from('project_members').select('user_id, role').eq('project_id', project.id),
    supabase
      .from('organisation_members')
      .select('user_id, role')
      .eq('organisation_id', project.organisation_id),
    supabase.rpc('org_member_emails', { p_org: project.organisation_id }),
    supabase.from('profiles').select('id, full_name'),
    supabase
      .from('project_members')
      .select('role')
      .eq('project_id', project.id)
      .eq('user_id', ctx.user.id)
      .maybeSingle(),
  ])

  const emailMap = new Map(
    ((emails as { user_id: string; email: string }[]) ?? []).map((e) => [e.user_id, e.email]),
  )
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const isOrgAdmin = ['owner', 'admin'].includes(ctx.role)
  const myProjectRole = myMembership?.role ?? (isOrgAdmin ? 'lead' : null)
  const canWrite = isOrgAdmin || (myProjectRole !== null && myProjectRole !== 'viewer')
  const canManageMembers = isOrgAdmin || myProjectRole === 'lead'

  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/projects" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>
            {project.name}{' '}
            {project.reference && <span className="badge grey">{project.reference}</span>}
          </h1>
        </div>
        {project.description && <p style={{ color: 'var(--muted)' }}>{project.description}</p>}
        <ProjectClient
          project={{ id: project.id, name: project.name }}
          canWrite={canWrite}
          canManageMembers={canManageMembers}
          folders={folders ?? []}
          documents={(documents ?? []).map((d) => {
            const versions = d.document_versions as {
              id: string
              version_number: number
              file_size_bytes: number
              mime_type: string
            }[]
            const current =
              versions.find((v) => v.id === d.current_version_id) ??
              [...versions].sort((a, b) => b.version_number - a.version_number)[0]
            return {
              id: d.id,
              name: d.name,
              folder_id: d.folder_id,
              updated_at: d.updated_at,
              versions: versions.length,
              size: current?.file_size_bytes ?? 0,
              mime: current?.mime_type ?? '',
            }
          })}
          members={(projectMembers ?? []).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            name: nameMap.get(m.user_id) ?? emailMap.get(m.user_id) ?? '—',
          }))}
          orgMembers={(orgMembers ?? []).map((m) => ({
            user_id: m.user_id,
            name: nameMap.get(m.user_id) ?? emailMap.get(m.user_id) ?? '—',
          }))}
        />
      </main>
    </Shell>
  )
}
