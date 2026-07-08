import { test, expect, request as pwRequest } from '@playwright/test'
import { baseURL } from './fixtures/tenants'

/**
 * AT-13 — JWKS rotation dual-publish window. During rotation the well-known
 * endpoint must serve BOTH the current and the previous key so tokens signed
 * by either verify for 24 h. Requires PLINTH_SSO_PREVIOUS_JWK to be set on the
 * running Hub to exercise the dual-publish state.
 */
test('AT-13 JWKS is well-formed and cacheable', async () => {
  const api = await pwRequest.newContext({ baseURL })
  const res = await api.get('/.well-known/plinth-sso.json')
  expect(res.ok()).toBeTruthy()
  expect(res.headers()['cache-control']).toContain('max-age=3600')
  const jwks = await res.json()
  expect(Array.isArray(jwks.keys)).toBeTruthy()
  expect(jwks.keys.length).toBeGreaterThanOrEqual(1)
  for (const k of jwks.keys) {
    expect(k.kty).toBe('RSA')
    expect(k.kid).toBeTruthy()
    expect(k.alg).toBe('RS256')
    expect(k.use).toBe('sig')
  }
  await api.dispose()
})

test('AT-13 dual-publish serves two distinct kids during rotation', async () => {
  test.skip(!process.env.PLINTH_SSO_PREVIOUS_JWK, 'set PLINTH_SSO_PREVIOUS_JWK on the Hub to test rotation')
  const api = await pwRequest.newContext({ baseURL })
  const jwks = await (await api.get('/.well-known/plinth-sso.json')).json()
  const kids = new Set(jwks.keys.map((k: { kid: string }) => k.kid))
  expect(kids.size).toBeGreaterThanOrEqual(2)
  await api.dispose()
})
