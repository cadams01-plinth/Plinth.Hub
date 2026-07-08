import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, adminClient } from './fixtures/auth'
import { ORGS, PROJECTS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-09 — quota block + meter accuracy. Shrink the org quota, confirm an
 * upload beyond it is rejected with PLINTH_QUOTA_EXCEEDED, and that
 * storage_used_bytes reflects committed versions (the maintain_storage_used
 * trigger).
 */
test('AT-09 upload beyond quota is blocked with PLINTH_QUOTA_EXCEEDED', async ({ page, context }) => {
  const admin = adminClient()
  const { data: before } = await admin
    .from('organisations')
    .select('storage_used_bytes, storage_quota_bytes')
    .eq('id', ORGS.hannahRail.id)
    .single()

  // Temporarily set quota just above current usage so a 100 MB upload fails.
  await admin
    .from('organisations')
    .update({ storage_quota_bytes: (before!.storage_used_bytes ?? 0) + 1000 })
    .eq('id', ORGS.hannahRail.id)

  try {
    await loginAs(page, USERS.hannahOwner.email)
    const api = await authed(context)
    const res = await api.post('/api/documents/upload-url', {
      data: {
        project_id: PROJECTS.marshLane.id,
        filename: 'big.pdf',
        size_bytes: 100 * 1024 * 1024,
        mime_type: 'application/pdf',
      },
    })
    expect(res.status()).toBe(413)
    expect((await res.json()).code).toBe('PLINTH_QUOTA_EXCEEDED')
    await api.dispose()
  } finally {
    await admin
      .from('organisations')
      .update({ storage_quota_bytes: before!.storage_quota_bytes })
      .eq('id', ORGS.hannahRail.id)
  }
})

test('AT-09 storage meter equals sum of committed versions', async () => {
  const admin = adminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('storage_used_bytes')
    .eq('id', ORGS.hannahRail.id)
    .single()
  const { data: versions } = await admin
    .from('document_versions')
    .select('file_size_bytes')
    .eq('organisation_id', ORGS.hannahRail.id)
  const sum = (versions ?? []).reduce((a, v) => a + v.file_size_bytes, 0)
  expect(org!.storage_used_bytes).toBe(sum)
})

async function authed(context: import('@playwright/test').BrowserContext) {
  const cookies = await context.cookies()
  return pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    storageState: { cookies, origins: [] },
  })
}
