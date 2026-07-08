import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs } from './fixtures/auth'
import { DOCUMENTS, PROJECTS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-03 — cross-tenant isolation across all surfaces + direct API/URL attacks.
 * Hannah Rail's owner must never touch Westmoor's projects/documents, whether
 * via the UI or by hitting the API/URL with a known foreign UUID.
 */
test.describe('AT-03 cross-tenant isolation', () => {
  test('UI: foreign project page is not accessible', async ({ page }) => {
    await loginAs(page, USERS.hannahOwner.email)
    const res = await page.goto(`/projects/${PROJECTS.a61.id}`)
    // notFound() → 404 (RLS hides the row)
    expect(res?.status()).toBe(404)
  })

  test('API: cannot mint a download URL for a foreign document', async ({ page, context }) => {
    await loginAs(page, USERS.hannahOwner.email)
    const api = await authedApi(context)
    const res = await api.get(`/api/documents/${DOCUMENTS.drainageLayout.id}/download-url`)
    expect(res.status()).toBe(403)
    await api.dispose()
  })

  test('API: cannot add a project member to a foreign project (escalation attempt)', async ({ page, context }) => {
    await loginAs(page, USERS.hannahOwner.email)
    const api = await authedApi(context)
    // The exact escalation the composite FK + route fix guard against.
    const res = await api.post(`/api/projects/${PROJECTS.a61.id}/members`, {
      data: { user_id: USERS.hannahOwner.id, role: 'lead' },
    })
    expect(res.status()).toBe(403)
    // And confirm no access leaked: the foreign project is still 404 in the UI.
    const check = await page.goto(`/projects/${PROJECTS.a61.id}`)
    expect(check?.status()).toBe(404)
    await api.dispose()
  })

  test('API: cannot upload into a foreign project', async ({ page, context }) => {
    await loginAs(page, USERS.hannahOwner.email)
    const api = await authedApi(context)
    const res = await api.post('/api/documents/upload-url', {
      data: {
        project_id: PROJECTS.a61.id,
        filename: 'x.pdf',
        size_bytes: 1000,
        mime_type: 'application/pdf',
      },
    })
    expect(res.status()).toBe(403)
    await api.dispose()
  })
})

async function authedApi(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
