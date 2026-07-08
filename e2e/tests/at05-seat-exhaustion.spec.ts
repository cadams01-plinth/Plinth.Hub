import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, adminClient } from './fixtures/auth'
import { APPS, ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-05 — seat exhaustion + upsell path. A 1-seat trial, both seats attempted;
 * the second assignment returns PLINTH_SEATS_EXHAUSTED (the capacity trigger).
 */
test('AT-05 assigning beyond purchased seats is rejected', async ({ page, context }) => {
  const admin = adminClient()
  await loginAs(page, USERS.westmoorOwner.email)
  const api = await authed(context)

  // Fresh trial (1 seat, self-assigned to owner).
  await admin.from('entitlements').delete().eq('organisation_id', ORGS.westmoor.id)
  await admin.from('subscriptions').delete().eq('organisation_id', ORGS.westmoor.id)
  await api.post('/api/billing/trial', { data: { app_slug: APPS.demo } })

  // Owner already holds the single seat; assigning a second user must fail.
  const res = await api.post('/api/entitlements', {
    data: { app_slug: APPS.demo, user_id: USERS.westmoorAdmin.id },
  })
  expect(res.status()).toBe(409)
  expect((await res.json()).code).toBe('PLINTH_SEATS_EXHAUSTED')

  await api.dispose()
})

async function authed(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
