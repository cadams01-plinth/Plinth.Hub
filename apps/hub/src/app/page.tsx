import Link from 'next/link'

/** Public landing page. Full marketing pages land in Phase 2 (SPEC §14 P2). */
export default function HomePage() {
  return (
    <>
      <header className="titleblock">
        <span className="lockup">PLINTH · HUB</span>
        <nav className="meta">
          <Link href="/sign-in" style={{ color: '#fff' }}>
            Sign in
          </Link>
        </nav>
      </header>
      <main className="container">
        <h1>The Plinth Resource suite, one front door.</h1>
        <p style={{ maxWidth: '46rem' }}>
          Projects, documents and specialist apps for infrastructure teams —
          with one account, one bill and one place to manage who can do what.
        </p>
        <p>
          <Link className="btn" href="/sign-in">
            Get started
          </Link>
        </p>
      </main>
    </>
  )
}
