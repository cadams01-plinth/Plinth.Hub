import Link from 'next/link'
import { PlinthBridge, PlinthWordmark } from '@/components/PlinthLogo'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Public landing page — Plinth Resource brand, links into the catalogue. */
export default async function HomePage() {
  const supabase = createClient()
  const { data: apps } = await supabase
    .from('apps')
    .select('slug, name, category, one_liner, status')
    .neq('status', 'hidden')
    .order('sort_order')

  return (
    <>
      <header className="titleblock">
        <PlinthWordmark />
        <nav className="meta">
          <Link href="/apps">Apps</Link>
          {' · '}
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <section className="hero">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PlinthBridge height={110} />
        </div>
        <h1>
          The <span className="gold">Plinth Resource</span> suite, one front door.
        </h1>
        <p>
          Projects, documents and specialist apps for infrastructure teams — with
          one account, one bill and one place to manage who can do what.
        </p>
        <Link className="btn" href="/sign-in">
          Get started
        </Link>
        <span style={{ display: 'inline-block', width: '0.75rem' }} />
        <Link className="btn navy" href="/apps" style={{ border: '1px solid #2a3c5c' }}>
          Browse the apps
        </Link>
      </section>
      <main className="container">
        <h2>Built for the way infrastructure work actually runs</h2>
        <div className="tile-grid">
          {(apps ?? []).map((app) => (
            <div className="card tile" key={app.slug}>
              <span className={`badge ${app.status === 'beta' ? 'beta' : ''}`}>
                {app.status === 'coming_soon' ? 'Coming soon' : app.category}
              </span>
              <h3>{app.name}</h3>
              <p className="one-liner">{app.one_liner}</p>
              <Link className="btn ghost" href={`/apps/${app.slug}`}>
                Learn more
              </Link>
            </div>
          ))}
          <div className="card tile">
            <span className="badge gold">Included</span>
            <h3>Projects &amp; documents</h3>
            <p className="one-liner">
              Versioned drawings and documents, organised by project, with a fast
              PDF viewer — included with every account.
            </p>
            <Link className="btn ghost" href="/sign-in">
              Start free
            </Link>
          </div>
        </div>
      </main>
      <footer className="site">
        <PlinthWordmark />
        <p>© {new Date().getFullYear()} Plinth Resource Ltd · hub.plinthresource.com</p>
      </footer>
    </>
  )
}
