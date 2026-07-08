'use client'

import { PlinthWordmark } from '@/components/PlinthLogo'

/** Global error boundary — named cause + retry (SPEC §5 error states). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <>
      <header className="titleblock">
        <PlinthWordmark />
      </header>
      <main className="container narrow">
        <div className="card empty">
          <h3>Something went wrong on our side</h3>
          <p>
            The error has been logged{error.digest ? ` (ref ${error.digest})` : ''}. Try
            again — if it keeps happening, email Chris@plinthresource.com.
          </p>
          <button className="btn" onClick={reset}>
            Try again
          </button>
        </div>
      </main>
    </>
  )
}
