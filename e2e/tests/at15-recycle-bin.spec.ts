import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs, adminClient } from './fixtures/auth'
import { ORGS, USERS, baseURL } from './fixtures/tenants'

/**
 * AT-15 — recycle-bin restore + 30-day purge cron. Delete a document, restore
 * it from the bin, then verify the purge cron permanently removes documents
 * soft-deleted more than 30 days ago.
 */
test('AT-15 delete → restore keeps the document', async ({ page }) => {
  test.slow()
  await loginAs(page, USERS.hannahOwner.email)
  await page.goto('/projects')
  const name = `AT15 ${Date.now()}`
  await page.getByLabel('New project').fill(name)
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload document' }).click()
  await (await chooser).setFiles({ name: 'bin.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF') })
  await expect(page.getByRole('link', { name: /bin\.pdf/ })).toBeVisible({ timeout: 30_000 })

  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.goto('/bin')
  await expect(page.getByText('bin.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText('bin.pdf')).toBeHidden({ timeout: 10_000 })
})

test('AT-15 purge cron permanently removes 30-day-old soft-deleted docs', async () => {
  test.skip(!process.env.CRON_SECRET, 'set CRON_SECRET to run the purge leg')
  const admin = adminClient()

  // Seed a document soft-deleted 31 days ago.
  const { data: proj } = await admin
    .from('projects')
    .select('id')
    .eq('organisation_id', ORGS.hannahRail.id)
    .limit(1)
    .single()
  const { data: doc } = await admin
    .from('documents')
    .insert({
      project_id: proj!.id,
      organisation_id: ORGS.hannahRail.id,
      name: 'AT15-purge.pdf',
      created_by: USERS.hannahOwner.id,
      deleted_at: new Date(Date.now() - 31 * 86400000).toISOString(),
    })
    .select('id')
    .single()

  const api = await pwRequest.newContext({ baseURL })
  const res = await api.post('/api/cron/purge-bin', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  expect(res.ok()).toBeTruthy()
  await api.dispose()

  const { data: gone } = await admin.from('documents').select('id').eq('id', doc!.id).maybeSingle()
  expect(gone).toBeNull()
})
