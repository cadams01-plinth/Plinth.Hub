'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SignInForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/launcher'
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault()
    setState('sending')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) {
      setState('error')
      setMessage(error.message)
    } else {
      setState('sent')
    }
  }

  return (
    <main className="container" style={{ maxWidth: 480 }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        {state === 'sent' ? (
          <div className="notice">
            Check your inbox — we&apos;ve sent a sign-in link to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={sendMagicLink}>
            <div className="form-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.co.uk"
              />
            </div>
            {state === 'error' && <div className="notice error">{message}</div>}
            <button className="btn" disabled={state === 'sending'} type="submit">
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

export default function SignInPage() {
  return (
    <>
      <header className="titleblock">
        <span className="lockup">PLINTH · HUB</span>
      </header>
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  )
}
