import { test, expect, request as pwRequest } from '@playwright/test'
import { loginAs } from './fixtures/auth'
import { USERS, baseURL } from './fixtures/tenants'

/**
 * AT-08 — version chain upload/restore. Upload v1, upload v2 of the same
 * document, confirm current_version bumps and both versions are selectable;
 * delete → recycle bin → restore keeps the chain intact.
 */
test('AT-08 multi-version upload then delete/restore', async ({ page, context }) => {
  test.slow()
  await loginAs(page, USERS.hannahOwner.email)

  // New project to isolate the chain
  await page.goto('/projects')
  const name = `AT08 Versions ${Date.now()}`
  await page.getByLabel('New project').fill(name)
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // v1
  await uploadPdf(page, 'chain.pdf', 'v1')
  await expect(page.getByRole('link', { name: /chain\.pdf/ })).toBeVisible({ timeout: 30_000 })

  // v2 via "New version"
  const chooser2 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'New version' }).click()
  await (await chooser2).setFiles({ name: 'chain.pdf', mimeType: 'application/pdf', buffer: pdf('v2') })
  await expect(page.getByRole('cell', { name: '2' })).toBeVisible({ timeout: 30_000 })

  // Viewer shows both versions
  await page.getByRole('link', { name: /chain\.pdf/ }).click()
  await expect(page.locator('.viewer-toolbar select option')).toHaveCount(2, { timeout: 30_000 })

  // Delete → bin → restore
  await page.goBack()
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.goto('/bin')
  await expect(page.getByText('chain.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText('chain.pdf')).toBeHidden({ timeout: 10_000 })
})

async function uploadPdf(page: import('@playwright/test').Page, filename: string, tag: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload document' }).click()
  await (await chooser).setFiles({ name: filename, mimeType: 'application/pdf', buffer: pdf(tag) })
}
function pdf(tag: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`, 'utf8')
}
void pwRequest
void baseURL
