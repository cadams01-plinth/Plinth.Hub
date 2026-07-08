import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'
import { USERS } from './fixtures/tenants'

/**
 * AT-01 — sign-up → org → project → upload → preview, scripted < 5 min.
 * Uses an existing seeded owner to avoid email-confirmation flakiness; the
 * org-creation leg is covered by the onboarding form.
 */
test('AT-01 create project, upload a document, preview it', async ({ page }) => {
  test.slow() // upload + first PDF render
  const started = Date.now()

  await loginAs(page, USERS.hannahOwner.email)

  // Create a project
  await page.goto('/projects')
  const name = `AT01 Bridge ${Date.now()}`
  await page.getByLabel('New project').fill(name)
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Upload a small PDF via the document workspace
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload document' }).click()
  const chooser = await fileChooserPromise
  await chooser.setFiles({
    name: 'at01.pdf',
    mimeType: 'application/pdf',
    buffer: minimalPdf(),
  })
  // finalise verifies server-side; the row appears after refresh
  await expect(page.getByRole('link', { name: /at01\.pdf/ })).toBeVisible({ timeout: 30_000 })

  // Preview
  await page.getByRole('link', { name: /at01\.pdf/ }).click()
  await expect(page.locator('.viewer-toolbar')).toBeVisible({ timeout: 30_000 })

  expect(Date.now() - started).toBeLessThan(5 * 60_000)
})

/** Smallest valid one-page PDF (passes the finalise magic-byte sniff). */
function minimalPdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
      'trailer<</Root 1 0 R>>\n%%EOF',
    'utf8',
  )
}
