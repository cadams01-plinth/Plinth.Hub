import { test, expect, request as pwRequest } from '@playwright/test'
import { adminClient, loginAs } from './fixtures/auth'
import { ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-02 — invite acceptance + the role matrix: each role attempts each
 * guarded action; the expected allow/deny table is checked exhaustively.
 * Guarded actions are exercised at the API layer (deterministic status codes)
 * from a logged-in browser context so the session cookie is real.
 */

interface Case {
  role: string
  email: string
  action: string
  method: 'POST' | 'PATCH' | 'DELETE'
  path: (orgId: string) => string
  body: Record<string, unknown>
  expect: 'allow' | 'deny'
}

// Expected allow/deny per SPEC §2 role semantics + §4 guards.
const CASES: Case[] = [
  { role: 'owner', email: USERS.hannahOwner.email, action: 'invite member', method: 'POST', path: (o) => `/api/orgs/${o}/members`, body: { email: 'atmatrix1@x.test', role: 'member' }, expect: 'allow' },
  { role: 'member', email: USERS.hannahMember.email, action: 'invite member', method: 'POST', path: (o) => `/api/orgs/${o}/members`, body: { email: 'atmatrix2@x.test', role: 'member' }, expect: 'deny' },
  { role: 'owner', email: USERS.hannahOwner.email, action: 'create project', method: 'POST', path: () => `/api/projects`, body: { name: 'AT02 Project' }, expect: 'allow' },
  { role: 'member', email: USERS.hannahMember.email, action: 'create project', method: 'POST', path: () => `/api/projects`, body: { name: 'AT02 Member Project' }, expect: 'allow' },
]

for (const c of CASES) {
  test(`AT-02 ${c.role} ${c.action} → ${c.expect}`, async ({ page, context }) => {
    await loginAs(page, c.email)
    const cookies = await context.cookies()
    const api = await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
      storageState: { cookies, origins: [] },
    })
    const res = await api[c.method.toLowerCase() as 'post'](c.path(ORGS.hannahRail.id), { data: c.body })
    if (c.expect === 'allow') {
      expect(res.status(), await res.text()).toBeLessThan(300)
    } else {
      expect(res.status()).toBe(403)
      expect((await res.json()).code).toBe('PLINTH_FORBIDDEN')
    }
    await api.dispose()
  })
}

test.afterAll(async () => {
  // Clean pending invitations created by the matrix
  await adminClient()
    .from('invitations')
    .delete()
    .in('email', ['atmatrix1@x.test', 'atmatrix2@x.test'])
})
