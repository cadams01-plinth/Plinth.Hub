'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Non-entitled tile actions: Start trial · Request seat · Notify me. */
export function TileAction({
  slug,
  state,
  isAdmin,
}: {
  slug: string
  state: 'trial_available' | 'seat_needed' | 'coming_soon'
  isAdmin: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  async function post(url: string, body: Record<string, unknown>, okMessage: string) {
    setBusy(true)
    setError('')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (res.ok) {
      setDone(okMessage)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.message ?? 'Something went wrong — please try again.')
    }
  }

  if (done) return <span className="badge ok">{done}</span>

  return (
    <>
      {state === 'trial_available' && (
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() =>
            post('/api/billing/trial', { app_slug: slug }, 'Trial started')
          }
        >
          {busy ? 'Starting…' : 'Start 14-day trial'}
        </button>
      )}
      {state === 'seat_needed' &&
        (isAdmin ? (
          <a className="btn ghost" href="/people">
            Assign seats
          </a>
        ) : (
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              post('/api/seats/request', { app_slug: slug }, 'Your admin has been asked')
            }
          >
            {busy ? 'Sending…' : 'Request a seat'}
          </button>
        ))}
      {state === 'coming_soon' && (
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() =>
            post('/api/notify-me', { app_slug: slug }, "We'll let you know")
          }
        >
          {busy ? 'Saving…' : 'Notify me'}
        </button>
      )}
      {error && <span className="badge danger">{error}</span>}
    </>
  )
}
