import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { PlinthWordmark } from '@/components/PlinthLogo'
import { DocumentViewer } from './viewer'

export const dynamic = 'force-dynamic'

/** Document viewer — SPEC §5. Titleblock carries the version switcher. */
export default async function DocumentPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/sign-in')
  const supabase = createClient()

  const { data: doc } = await supabase
    .from('documents')
    .select(
      'id, name, project_id, current_version_id, projects(name), document_versions(id, version_number, mime_type, file_size_bytes, uploaded_at)',
    )
    .eq('id', params.id)
    .maybeSingle()
  if (!doc) notFound()

  const versions = (
    doc.document_versions as {
      id: string
      version_number: number
      mime_type: string
      file_size_bytes: number
      uploaded_at: string
    }[]
  ).sort((a, b) => b.version_number - a.version_number)
  const current = versions.find((v) => v.id === doc.current_version_id) ?? versions[0]

  return (
    <>
      <header className="titleblock">
        <Link href={`/projects/${doc.project_id}`} style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <span className="meta">
          {(doc.projects as unknown as { name: string })?.name} · <strong>{doc.name}</strong>
        </span>
      </header>
      {versions.length === 0 ? (
        <main className="container">
          <div className="card empty">
            <h3>No versions uploaded yet</h3>
            <p>
              Upload a file from the <Link href={`/projects/${doc.project_id}`}>project page</Link>.
            </p>
          </div>
        </main>
      ) : (
        <DocumentViewer
          documentId={doc.id}
          documentName={doc.name}
          versions={versions.map((v) => ({
            version_number: v.version_number,
            mime_type: v.mime_type,
            uploaded_at: v.uploaded_at,
            current: v.id === current?.id,
          }))}
        />
      )}
    </>
  )
}
