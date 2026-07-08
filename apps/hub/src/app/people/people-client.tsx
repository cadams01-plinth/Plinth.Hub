'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Member {
  user_id: string
  role: string
  email: string
  name: string | null
}
interface Invite {
  id: string
  email: string
  role: string
  expires_at: string
}
interface SeatApp {
  app_id: string
  slug: string
  name: string
  seats: number
  status: string
  assigned: string[]
}

export function PeopleClient({
  orgId,
  myUserId,
  myRole,
  members,
  invites,
  apps,
}: {
  orgId: string
  myUserId: string
  myRole: string
  members: Member[]
  invites: Invite[]
  apps: SeatApp[]
}) {
  const router = useRouter()
  const isAdmin = ['owner', 'admin'].includes(myRole)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [busy, setBusy] = useState(false)

  async function call(method: string, url: string, body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? 'That didn’t work — please try again.')
      return false
    }
    router.refresh()
    return true
  }

  return (
    <>
      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <h2>Members</h2>
        <div className="table-wrap">
          <table className="plinth">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.name ?? '—'}{m.user_id === myUserId && ' (you)'}</td>
                  <td>{m.email}</td>
                  <td>
                    {m.role === 'owner' || !isAdmin || m.user_id === myUserId ? (
                      <span className={`badge ${m.role === 'owner' ? 'gold' : ''}`}>{m.role}</span>
                    ) : (
                      <select
                        defaultValue={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          call('PATCH', `/api/orgs/${orgId}/members`, {
                            user_id: m.user_id,
                            role: e.target.value,
                          })
                        }
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      {m.role !== 'owner' && m.user_id !== myUserId && (
                        <button
                          className="btn small danger"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Remove ${m.email} from the organisation?`)) {
                              call('DELETE', `/api/orgs/${orgId}/members`, { user_id: m.user_id })
                            }
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isAdmin && (
          <form
            className="form-row"
            style={{ marginTop: '1rem' }}
            onSubmit={async (e) => {
              e.preventDefault()
              if (await call('POST', `/api/orgs/${orgId}/members`, { email: inviteEmail, role: inviteRole })) {
                setInviteEmail('')
              }
            }}
          >
            <div className="form-field">
              <label htmlFor="invite-email">Invite by email</label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.co.uk"
              />
            </div>
            <div className="form-field" style={{ maxWidth: 140 }}>
              <label htmlFor="invite-role">Role</label>
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Send invite
            </button>
          </form>
        )}
      </div>

      {isAdmin && invites.length > 0 && (
        <div className="card">
          <h2>Pending invitations</h2>
          <div className="table-wrap">
            <table className="plinth">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td><span className="badge">{i.role}</span></td>
                    <td>{new Date(i.expires_at).toLocaleDateString('en-GB')}</td>
                    <td>
                      <button
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => call('DELETE', `/api/orgs/${orgId}/members`, { invitation_id: i.id })}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>App seats</h2>
        {apps.length === 0 ? (
          <div className="empty">
            <h3>No subscriptions yet</h3>
            <p>Start a trial from the launcher and seats will appear here.</p>
          </div>
        ) : (
          apps.map((app) => (
            <div key={app.app_id} style={{ marginBottom: '1.5rem' }}>
              <div className="page-head">
                <h3 style={{ margin: '0.25rem 0' }}>
                  {app.name}{' '}
                  <span className={`badge ${app.assigned.length >= app.seats ? 'danger' : 'ok'}`}>
                    {app.assigned.length} of {app.seats} assigned
                  </span>
                  {app.status === 'trialing' && <span className="badge gold"> trial</span>}
                </h3>
              </div>
              <div className="table-wrap">
                <table className="plinth">
                  <tbody>
                    {members.map((m) => {
                      const has = app.assigned.includes(m.user_id)
                      return (
                        <tr key={m.user_id}>
                          <td>{m.name ?? m.email}</td>
                          <td style={{ width: 140 }}>
                            {has ? <span className="badge ok">seat</span> : <span className="badge grey">no seat</span>}
                          </td>
                          {isAdmin && (
                            <td style={{ width: 140 }}>
                              {m.role === 'viewer' && !has ? (
                                <span className="badge grey" title="Viewers cannot hold write-capable seats">viewer</span>
                              ) : (
                                <button
                                  className={`btn small ${has ? 'ghost' : 'secondary'}`}
                                  disabled={busy}
                                  onClick={() =>
                                    call(has ? 'DELETE' : 'POST', '/api/entitlements', {
                                      app_slug: app.slug,
                                      user_id: m.user_id,
                                    })
                                  }
                                >
                                  {has ? 'Unassign' : 'Assign'}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
