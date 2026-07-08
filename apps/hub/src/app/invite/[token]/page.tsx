'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PlinthWordmark } from '@/components/PlinthLogo'

/** Invite landing: accepts the invitation once signed in. */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<'working' | 'error'>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function accept() {
      const res = await fetch('/api/auth/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (cancelled) return
      if (res.ok) {
        router.replace('/launcher')
      } else if (res.status === 401) {
        router.replace(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`)
      } else {
        const body = await res.json().catch(() => ({}))
        setState('error')
        setMessage(body.message ?? 'This invitation is no longer valid.')
      }
    }
    accept()
    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <>
      <header className="titleblock">
        <PlinthWordmark />
      </header>
      <main className="container narrow">
        <div className="card">
          {state === 'working' ? (
            <>
              <h1>Joining the organisation…</h1>
              <div className="skeleton" style={{ height: '1.5rem' }} />
            </>
          ) : (
            <>
              <h1>Invitation problem</h1>
              <div className="notice error">{message}</div>
              <p>Ask the person who invited you to send a fresh invitation.</p>
            </>
          )}
        </div>
      </main>
    </>
  )
}
