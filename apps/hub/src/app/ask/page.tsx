import { redirect } from 'next/navigation'
import { getOrgContext } from '@/lib/org'
import { getActiveImpersonation } from '@/lib/impersonation'
import { Shell } from '@/components/Shell'
import { AskClient } from './ask-client'

export const dynamic = 'force-dynamic'

/** Ask Plinth — SPEC §7. */
export default async function AskPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/onboarding')
  const impersonation = await getActiveImpersonation()

  return (
    <Shell ctx={ctx} active="/ask" impersonation={impersonation}>
      <main className="container">
        <div className="page-head">
          <h1>Ask Plinth</h1>
        </div>
        {!ctx.org.ai_enabled ? (
          <div className="card empty">
            <h3>Ask Plinth is switched off</h3>
            <p>An owner or admin can enable it in organisation settings.</p>
          </div>
        ) : (
          <AskClient />
        )}
      </main>
    </Shell>
  )
}
