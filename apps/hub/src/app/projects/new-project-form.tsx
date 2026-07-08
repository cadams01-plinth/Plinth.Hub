'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function NewProjectForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <form
      className="card form-row"
      style={{ marginBottom: '1.25rem' }}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, reference: reference || undefined }),
        })
        setBusy(false)
        if (res.ok) {
          const { project } = await res.json()
          router.push(`/projects/${project.id}`)
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data.message ?? 'Could not create the project')
        }
      }}
    >
      <div className="form-field">
        <label htmlFor="project-name">New project</label>
        <input
          id="project-name"
          required
          minLength={2}
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Marsh Lane Bridge Renewal"
        />
      </div>
      <div className="form-field" style={{ maxWidth: 180 }}>
        <label htmlFor="project-ref">Reference (optional)</label>
        <input
          id="project-ref"
          maxLength={60}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="HR-2026-014"
        />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create project'}
      </button>
      {error && <span className="badge danger">{error}</span>}
    </form>
  )
}
