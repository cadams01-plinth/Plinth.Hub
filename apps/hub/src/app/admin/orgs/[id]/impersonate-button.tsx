'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Impersonation start — reason + consent reference modal (AT-11). */
export function ImpersonateButton({
  organisationId,
  organisationName,
}: {
  organisationId: string
  organisationName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [consent, setConsent] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open) {
    return (
      <button className="btn navy" onClick={() => setOpen(true)}>
        Impersonate…
      </button>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h3 style={{ marginTop: 0 }}>Support session for {organisationName}</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        The organisation&apos;s owners will see this session and receive an email when it
        ends. Every action is audited.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          const res = await fetch('/api/admin/impersonation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organisation_id: organisationId,
              reason,
              consent_reference: consent,
            }),
          })
          setBusy(false)
          if (res.ok) {
            router.push('/launcher')
          } else {
            const data = await res.json().catch(() => ({}))
            setError(data.message ?? 'Could not start the session')
          }
        }}
      >
        <div className="form-field">
          <label htmlFor="imp-reason">Reason (min 10 characters)</label>
          <textarea
            id="imp-reason"
            required
            minLength={10}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Investigating support ticket: documents not appearing"
          />
        </div>
        <div className="form-field">
          <label htmlFor="imp-consent">Consent reference</label>
          <input
            id="imp-consent"
            required
            minLength={2}
            maxLength={120}
            value={consent}
            onChange={(e) => setConsent(e.target.value)}
            placeholder="TICKET-1234"
          />
        </div>
        {error && <div className="notice error">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Starting…' : 'Start support session'}
        </button>{' '}
        <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </form>
    </div>
  )
}
