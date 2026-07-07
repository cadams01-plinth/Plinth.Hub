'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Wizard step 1: create the organisation (SPEC §4 /api/orgs). */
export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function createOrg(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    })
    if (res.ok) {
      router.push('/launcher')
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.message ?? 'Something went wrong — please try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <header className="titleblock">
        <span className="lockup">PLINTH · HUB</span>
        <span className="meta">Set up your workspace</span>
      </header>
      <main className="container" style={{ maxWidth: 520 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Name your organisation</h1>
          <form onSubmit={createOrg}>
            <div className="form-field">
              <label htmlFor="org-name">Organisation name</label>
              <input
                id="org-name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
                placeholder="Hannah Rail Ltd"
              />
            </div>
            <div className="form-field">
              <label htmlFor="org-slug">Workspace address</label>
              <input
                id="org-slug"
                required
                pattern="[a-z0-9][a-z0-9-]{1,60}"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(e.target.value)
                }}
                placeholder="hannah-rail"
              />
            </div>
            {error && <div className="notice error">{error}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create organisation'}
            </button>
          </form>
        </div>
      </main>
    </>
  )
}
