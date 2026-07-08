import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, adminClient } from './fixtures/auth'
import { ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-12 — audit completeness: every state-changing route leaves exactly one
 * audit row. Drives a representative set of state changes and asserts the
 * count delta is exactly one per action.
 */
const ACTIONS: { name: string; run: (api: import('@playwright/test').APIRequestContext) => Promise<void>; action: string }[] = [
  {
    name: 'create project',
    action: 'project.created',
    run: async (api) => {
      const r = await api.post('/api/projects', { data: { name: `AT12 ${Date.now()}` } })
      expect(r.ok()).toBeTruthy()
    },
  },
  {
    name: 'invite member',
    action: 'member.invited',
    run: async (api) => {
      const r = await api.post(`/api/orgs/${ORGS.hannahRail.id}/members`, {
        data: { email: `at12-${Date.now()}@x.test`, role: 'member' },
      })
      expect(r.ok()).toBeTruthy()
    },
  },
]

for (const a of ACTIONS) {
  test(`AT-12 "${a.name}" writes exactly one ${a.action} audit row`, async ({ page, context }) => {
    const admin = adminClient()
    await loginAs(page, USERS.hannahOwner.email)
    const api = await authed(context)

    const before = await countAudit(admin, a.action)
    await a.run(api)
    // Audit write is fire-and-forget; allow a moment.
    await page.waitForTimeout(1000)
    const after = await countAudit(admin, a.action)
    expect(after - before).toBe(1)
    await api.dispose()
  })
}

async function countAudit(admin: ReturnType<typeof adminClient>, action: string): Promise<number> {
  const { count } = await admin
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', ORGS.hannahRail.id)
    .eq('action', action)
  return count ?? 0
}
async function authed(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
