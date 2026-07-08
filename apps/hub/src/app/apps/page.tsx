import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PlinthWordmark } from '@/components/PlinthLogo'

export const dynamic = 'force-dynamic'

/** Public catalogue — SPEC §14 P2 public pages. */
export default async function AppsPage() {
  const supabase = createClient()
  const { data: apps } = await supabase
    .from('apps')
    .select('slug, name, category, one_liner, status')
    .neq('status', 'hidden')
    .order('sort_order')

  return (
    <>
      <header className="titleblock">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <nav className="meta">
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </header>
      <main className="container">
        <h1>The Plinth suite</h1>
        <p style={{ maxWidth: '44rem', color: 'var(--muted)' }}>
          Specialist apps that share one account, one bill, one set of projects
          and documents. Start any of them with a 14-day trial.
        </p>
        <div className="tile-grid">
          {(apps ?? []).map((app) => (
            <div className="card tile" key={app.slug}>
              <span className={`badge ${app.status === 'beta' ? 'beta' : ''}`}>
                {app.status === 'coming_soon' ? 'Coming soon' : app.status === 'beta' ? 'Beta' : app.category}
              </span>
              <h3>{app.name}</h3>
              <p className="one-liner">{app.one_liner}</p>
              <Link className="btn ghost" href={`/apps/${app.slug}`}>
                Details
              </Link>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
