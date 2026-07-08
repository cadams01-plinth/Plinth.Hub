import Link from 'next/link'
import { PlinthWordmark } from '@/components/PlinthLogo'
import type { OrgContext } from '@/lib/org'

const NAV = [
  { href: '/launcher', label: 'Apps' },
  { href: '/projects', label: 'Projects' },
  { href: '/people', label: 'People' },
  { href: '/billing', label: 'Billing' },
  { href: '/audit', label: 'Audit' },
  { href: '/ask', label: 'Ask Plinth' },
]

/**
 * The signed-in app shell: titleblock strip (brand + org + plan), primary
 * navigation, and the impersonation banner when a support session is live
 * (AT-11 — always visible, never suppressible).
 */
export function Shell({
  ctx,
  active,
  impersonation,
  children,
}: {
  ctx: OrgContext
  active: string
  impersonation?: { organisationName: string } | null
  children: React.ReactNode
}) {
  const plan =
    ctx.org.billing_status === 'free'
      ? 'Free plan'
      : ctx.org.billing_status.replace('_', ' ')
  return (
    <>
      {impersonation && (
        <div className="impersonation-banner">
          <span>
            SUPPORT SESSION — you are viewing {impersonation.organisationName} as
            Plinth staff. Every action is audited and visible to the organisation.
          </span>
          <form action="/api/admin/impersonation/stop" method="post">
            <button className="btn small navy" type="submit">
              End session
            </button>
          </form>
        </div>
      )}
      <header className="titleblock">
        <Link href="/launcher" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <div className="meta">
          <strong>{ctx.org.name}</strong> · {plan}
          {ctx.isSuperAdmin && (
            <>
              {' · '}
              <Link href="/admin">Admin</Link>
            </>
          )}
          {' · '}
          <Link href="/sign-out">Sign out</Link>
        </div>
      </header>
      <nav className="appnav" aria-label="Primary">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {children}
    </>
  )
}
