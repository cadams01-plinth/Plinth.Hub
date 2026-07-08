import { test, expect, request as pwRequest } from '@playwright/test'
import { mintTestPlt } from './fixtures/sso'
import { APPS, ORGS, USERS } from './fixtures/tenants'

/**
 * AT-14 — PLT replay rejected. A suite app's offline verifier accepts a PLT
 * once and rejects the second use of the same jti (10-minute replay cache).
 * Driven against the demo app (apps/demo) which uses @plinth/auth.
 */
const demoUrl = process.env.PLINTH_DEMO_URL

test('AT-14 the same PLT jti is rejected on second use', async () => {
  test.skip(!demoUrl || !process.env.PLINTH_SSO_PRIVATE_KEY_B64, 'needs PLINTH_DEMO_URL + PLINTH_SSO_PRIVATE_KEY_B64')

  const token = await mintTestPlt({
    appSlug: APPS.demo,
    userId: USERS.westmoorOwner.id,
    org: ORGS.westmoor.id,
  })

  const api = await pwRequest.newContext()

  // First use: accepted → the demo app establishes its own session.
  const first = await api.post(`${demoUrl}/session`, {
    headers: { 'Content-Type': 'text/plain' },
    data: token,
  })
  expect(first.status()).toBe(200)

  // Second use of the same token (same jti): rejected as replay.
  const second = await api.post(`${demoUrl}/session`, {
    headers: { 'Content-Type': 'text/plain' },
    data: token,
  })
  expect(second.status()).toBe(401)
  expect((await second.json()).code).toBe('PLINTH_TOKEN_REPLAY')

  await api.dispose()
})

test('AT-14 an expired PLT is rejected', async () => {
  test.skip(!demoUrl || !process.env.PLINTH_SSO_PRIVATE_KEY_B64, 'needs PLINTH_DEMO_URL + PLINTH_SSO_PRIVATE_KEY_B64')
  const token = await mintTestPlt({
    appSlug: APPS.demo,
    userId: USERS.westmoorOwner.id,
    org: ORGS.westmoor.id,
    expiresInSeconds: -10, // already expired
  })
  const api = await pwRequest.newContext()
  const res = await api.post(`${demoUrl}/session`, {
    headers: { 'Content-Type': 'text/plain' },
    data: token,
  })
  expect(res.status()).toBe(401)
  expect((await res.json()).code).toBe('PLINTH_TOKEN_EXPIRED')
  await api.dispose()
})
