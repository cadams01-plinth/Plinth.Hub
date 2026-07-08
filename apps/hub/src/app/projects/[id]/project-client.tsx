'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Folder {
  id: string
  name: string
  parent_id: string | null
}
interface Doc {
  id: string
  name: string
  folder_id: string | null
  updated_at: string
  versions: number
  size: number
  mime: string
}
interface Member {
  user_id: string
  role: string
  name: string
}

function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function ProjectClient({
  project,
  canWrite,
  canManageMembers,
  folders,
  documents,
  members,
  orgMembers,
}: {
  project: { id: string; name: string }
  canWrite: boolean
  canManageMembers: boolean
  folders: Folder[]
  documents: Doc[]
  members: Member[]
  orgMembers: { user_id: string; name: string }[]
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [addUser, setAddUser] = useState('')
  const [addRole, setAddRole] = useState('contributor')
  const [replaceTarget, setReplaceTarget] = useState<Doc | null>(null)

  /** SPEC §4 pipeline: upload-url → PUT via signed URL → finalise. */
  async function uploadFile(file: File, documentId?: string) {
    setError('')
    setProgress(`Preparing ${file.name}…`)
    const prep = await fetch('/api/documents/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: project.id,
        folder_id: currentFolder,
        document_id: documentId,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
      }),
    })
    if (!prep.ok) {
      const data = await prep.json().catch(() => ({}))
      setProgress('')
      setError(data.message ?? 'Upload refused')
      return
    }
    const { document_id, version_number, storage_path, token } = await prep.json()

    setProgress(`Uploading ${file.name}…`)
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('project-documents')
      .uploadToSignedUrl(storage_path, token, file, { contentType: file.type || undefined })
    if (upErr) {
      setProgress('')
      setError(`Upload failed: ${upErr.message}`)
      return
    }

    setProgress('Verifying…')
    const fin = await fetch(`/api/documents/${document_id}/finalise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path,
        version_number,
        mime_type: file.type || 'application/octet-stream',
      }),
    })
    setProgress('')
    if (!fin.ok) {
      const data = await fin.json().catch(() => ({}))
      setError(data.message ?? 'The file failed verification')
      return
    }
    router.refresh()
  }

  const visibleDocs = documents.filter((d) => d.folder_id === currentFolder)
  const childFolders = folders.filter((f) => f.parent_id === (currentFolder ?? null))

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      {progress && <div className="notice">{progress}</div>}

      <div className="card">
        <div className="page-head">
          <h2>
            Documents
            {currentFolder && (
              <>
                {' '}
                <button className="btn small ghost" onClick={() => setCurrentFolder(null)}>
                  ← back to root
                </button>{' '}
                <span className="badge">{folders.find((f) => f.id === currentFolder)?.name}</span>
              </>
            )}
          </h2>
          {canWrite && (
            <span>
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadFile(file, replaceTarget?.id)
                  setReplaceTarget(null)
                  e.target.value = ''
                }}
              />
              <button className="btn" onClick={() => fileInput.current?.click()}>
                Upload document
              </button>
            </span>
          )}
        </div>

        {canWrite && (
          <form
            className="form-row"
            style={{ marginBottom: '1rem' }}
            onSubmit={async (e) => {
              e.preventDefault()
              const res = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: project.id,
                  parent_id: currentFolder,
                  name: newFolder,
                }),
              })
              if (res.ok) {
                setNewFolder('')
                router.refresh()
              } else {
                const data = await res.json().catch(() => ({}))
                setError(data.message ?? 'Could not create folder')
              }
            }}
          >
            <div className="form-field" style={{ maxWidth: 260 }}>
              <label htmlFor="new-folder">New folder</label>
              <input
                id="new-folder"
                value={newFolder}
                required
                maxLength={120}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="Drawings"
              />
            </div>
            <button className="btn secondary" type="submit">
              Add folder
            </button>
          </form>
        )}

        {childFolders.length === 0 && visibleDocs.length === 0 ? (
          <div className="empty">
            <h3>Nothing here yet</h3>
            <p>{canWrite ? 'Upload the first document — up to 500 MB each.' : 'No documents have been shared with you here.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="plinth">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Versions</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {childFolders.map((f) => (
                  <tr key={f.id}>
                    <td colSpan={4}>
                      📁{' '}
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentFolder(f.id)
                        }}
                      >
                        {f.name}
                      </a>
                    </td>
                    <td />
                  </tr>
                ))}
                {visibleDocs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={`/documents/${d.id}`}>
                        <strong>{d.name}</strong>
                      </a>
                    </td>
                    <td>{d.size ? fmtSize(d.size) : '—'}</td>
                    <td>{d.versions}</td>
                    <td>{new Date(d.updated_at).toLocaleDateString('en-GB')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && (
                        <>
                          <button
                            className="btn small secondary"
                            onClick={() => {
                              setReplaceTarget(d)
                              fileInput.current?.click()
                            }}
                          >
                            New version
                          </button>{' '}
                          <button
                            className="btn small ghost"
                            onClick={async () => {
                              if (!confirm(`Move "${d.name}" to the recycle bin?`)) return
                              const res = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' })
                              if (res.ok) router.refresh()
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Project access</h2>
        <div className="table-wrap">
          <table className="plinth">
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.name}</td>
                  <td>
                    <span className={`badge ${m.role === 'lead' ? 'gold' : ''}`}>{m.role}</span>
                  </td>
                  <td style={{ width: 120 }}>
                    {canManageMembers && (
                      <button
                        className="btn small ghost"
                        onClick={async () => {
                          const res = await fetch(`/api/projects/${project.id}/members`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: m.user_id }),
                          })
                          if (res.ok) router.refresh()
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManageMembers && (
          <form
            className="form-row"
            style={{ marginTop: '1rem' }}
            onSubmit={async (e) => {
              e.preventDefault()
              if (!addUser) return
              const res = await fetch(`/api/projects/${project.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: addUser, role: addRole }),
              })
              if (res.ok) {
                setAddUser('')
                router.refresh()
              } else {
                const data = await res.json().catch(() => ({}))
                setError(data.message ?? 'Could not add them')
              }
            }}
          >
            <div className="form-field" style={{ maxWidth: 260 }}>
              <label htmlFor="add-user">Add person</label>
              <select id="add-user" value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">Choose…</option>
                {orgMembers
                  .filter((om) => !members.some((m) => m.user_id === om.user_id))
                  .map((om) => (
                    <option key={om.user_id} value={om.user_id}>
                      {om.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-field" style={{ maxWidth: 160 }}>
              <label htmlFor="add-role">Role</label>
              <select id="add-role" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                <option value="lead">lead</option>
                <option value="contributor">contributor</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
            <button className="btn secondary" type="submit">
              Add to project
            </button>
          </form>
        )}
      </div>
    </>
  )
}
