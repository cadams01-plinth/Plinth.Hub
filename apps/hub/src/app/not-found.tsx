import Link from 'next/link'
import { PlinthWordmark } from '@/components/PlinthLogo'

export default function NotFound() {
  return (
    <>
      <header className="titleblock">
        <Link href="/" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
      </header>
      <main className="container narrow">
        <div className="card empty">
          <h3>Page not found</h3>
          <p>That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
          <Link className="btn" href="/launcher">
            Back to the Hub
          </Link>
        </div>
      </main>
    </>
  )
}
