'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CatalogueApp {
  id?: string
  slug: string
  name: string
  category: string
  one_liner: string
  description: string
  status: string
  app_url: string | null
  redirect_urls: string[]
  sort_order: number
}

const EMPTY: CatalogueApp = {
  slug: '',
  name: '',
  category: '',
  one_liner: '',
  description: '',
  status: 'coming_soon',
  app_url: null,
  redirect_urls: [],
  sort_order: 100,
}

export function CatalogueClient({ apps }: { apps: CatalogueApp[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<CatalogueApp | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(app: CatalogueApp) {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...app,
        app_url: app.app_url || null,
        redirect_urls: app.redirect_urls.filter(Boolean),
      }),
    })
    setBusy(false)
    if (res.ok) {
      setEditing(null)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? 'Save failed')
    }
  }

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table className="plinth">
          <thead>
            <tr>
              <th>App</th>
              <th>Status</th>
              <th>Launch URL</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.slug}>
                <td>
                  <strong>{app.name}</strong> <code>{app.slug}</code>
                </td>
                <td>
                  <span className={`badge ${app.status === 'live' ? 'ok' : app.status === 'beta' ? 'beta' : 'grey'}`}>
                    {app.status}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{app.app_url ?? '—'}</td>
                <td>
                  <button className="btn small secondary" onClick={() => setEditing(app)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '1rem' }}>
        <button className="btn" onClick={() => setEditing({ ...EMPTY })}>
          Add app
        </button>
      </p>

      {editing && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>{editing.id ? `Edit ${editing.name}` : 'New app'}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              save(editing)
            }}
          >
            <div className="form-row">
              <div className="form-field">
                <label>Name</label>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Slug</label>
                <input
                  required
                  pattern="[a-z0-9][a-z0-9-]{1,60}"
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ maxWidth: 150 }}>
                <label>Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  <option value="live">live</option>
                  <option value="beta">beta</option>
                  <option value="coming_soon">coming_soon</option>
                  <option value="hidden">hidden</option>
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <div className="form-field">
                <label>Category</label>
                <input
                  required
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </div>
              <div className="form-field" style={{ maxWidth: 120 }}>
                <label>Sort</label>
                <input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="form-field" style={{ marginTop: '0.75rem' }}>
              <label>One-liner</label>
              <input
                required
                maxLength={200}
                value={editing.one_liner}
                onChange={(e) => setEditing({ ...editing, one_liner: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Description</label>
              <textarea
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>App URL</label>
              <input
                type="url"
                value={editing.app_url ?? ''}
                onChange={(e) => setEditing({ ...editing, app_url: e.target.value || null })}
                placeholder="https://itp.plinthresource.com"
              />
            </div>
            <div className="form-field">
              <label>SSO redirect URLs (one per line, exact match)</label>
              <textarea
                rows={2}
                value={editing.redirect_urls.join('\n')}
                onChange={(e) =>
                  setEditing({ ...editing, redirect_urls: e.target.value.split('\n').map((s) => s.trim()) })
                }
                placeholder="https://itp.plinthresource.com/auth/plinth"
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>{' '}
            <button className="btn ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </>
  )
}
