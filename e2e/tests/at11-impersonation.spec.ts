import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, grantSuperAdmin, revokeSuperAdmin, adminClient } from './fixtures/auth'
import { ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-11 — impersonation consent + banner + audit + owner visibility.
 * A super admin starts a session (reason + consent), sees the banner, and the
 * org's owner can see the session in their audit view — transparency by design.
 */
test.describe('AT-11 impersonation transparency', () => {
  test.beforeAll(async () => {
    await grantSuperAdmin(USERS.consultant.id)
  })
  test.afterAll(async () => {
    await adminClient().from('impersonation_sessions').delete().eq('organisation_id', ORGS.hannahRail.id)
    await revokeSuperAdmin(USERS.consultant.id)
  })

  test('start requires reason + consent, shows banner, is owner-visible + audited', async ({ page, context }) => {
    await loginAs(page, USERS.consultant.email, '/admin')

    // Start via the cockpit API (the modal posts here).
    const api = await authed(context)
    const start = await api.post('/api/admin/impersonation', {
      data: {
        organisation_id: ORGS.hannahRail.id,
        reason: 'Investigating support ticket TICKET-9',
        consent_reference: 'TICKET-9',
      },
    })
    expect(start.status()).toBe(201)

    // Banner is visible on the app shell.
    await page.goto('/launcher')
    await expect(page.locator('.impersonation-banner')).toContainText(/SUPPORT SESSION/i)

    // Missing reason is rejected.
    const bad = await api.post('/api/admin/impersonation', {
      data: { organisation_id: ORGS.hannahRail.id, reason: 'too short', consent_reference: 'X' },
    })
    expect(bad.status()).toBe(422)
    await api.dispose()

    // Owner sees the session in their audit view (transparency).
    const ownerPage = await context.browser()!.newPage()
    await loginAs(ownerPage, USERS.hannahOwner.email, '/audit')
    await expect(ownerPage.getByText(/Plinth support session started/i).first()).toBeVisible({ timeout: 15_000 })
    await ownerPage.close()
  })
})

async function authed(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
