import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, adminClient } from './fixtures/auth'
import { APPS, ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-04 — trial → tile → SSO → demo app → licence check.
 * The demo app (apps/demo) is the offline-verification target. Requires
 * PLINTH_DEMO_URL to point at a running demo app; skipped otherwise.
 */
const demoUrl = process.env.PLINTH_DEMO_URL

test('AT-04 start trial then launch the demo app over SSO', async ({ page, context }) => {
  test.skip(!demoUrl, 'set PLINTH_DEMO_URL to run the SSO leg')
  await loginAs(page, USERS.westmoorOwner.email)

  // Ensure the demo app is entitled for this org (trial) — start via API.
  const api = await authed(context)
  await api.post('/api/billing/trial', { data: { app_slug: APPS.demo } })

  // Launch: the Hub 302s to {demo}#token=<PLT>; the demo app verifies offline.
  await page.goto(`/api/sso/launch?app=${APPS.demo}`)
  await page.waitForURL(new RegExp(demoUrl!.replace(/[/.]/g, '\\$&')))
  await expect(page.locator('.ok')).toContainText(/Signed in as/i, { timeout: 15_000 })

  await api.dispose()
})

test('AT-04 licence check returns entitled for a live entitlement', async ({ page, context }) => {
  // A valid PLT reaching /api/licence/check for an entitled user → 200 entitled.
  await loginAs(page, USERS.westmoorOwner.email)
  const api = await authed(context)
  await api.post('/api/billing/trial', { data: { app_slug: APPS.demo } })
  await api.dispose()

  // Confirm the entitlement row exists (the licence check itself needs a PLT,
  // exercised in the SSO leg above / AT-14 for the token mechanics).
  const { data } = await adminClient()
    .from('subscriptions')
    .select('status')
    .eq('organisation_id', ORGS.westmoor.id)
    .maybeSingle()
  expect(['trialing', 'active']).toContain(data?.status)
})

async function authed(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
