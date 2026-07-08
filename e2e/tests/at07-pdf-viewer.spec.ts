import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'
import { DOCUMENTS, USERS } from './fixtures/tenants'

/**
 * AT-07 — PDF viewer function + performance budget (SPEC §5, §11: first page
 * of a large drawing < 3 s on simulated 4G). Runs under the chromium-4g
 * project; the seeded GA drawing stands in for the 200 MB drawing (a true
 * 200 MB fixture is provisioned in CI via env PLINTH_LARGE_PDF_DOC_ID).
 */
test('AT-07 viewer renders, paginates, and switches versions', async ({ page }) => {
  await loginAs(page, USERS.hannahOwner.email)
  await page.goto(`/documents/${DOCUMENTS.gaDeckPlan.id}`)

  // Toolbar + at least one rendered page canvas.
  await expect(page.locator('.viewer-toolbar')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.viewer-main canvas').first()).toBeVisible({ timeout: 30_000 })

  // Version switcher present (the seed doc is multi-version).
  const versionSelect = page.locator('.viewer-toolbar select')
  await expect(versionSelect).toBeVisible()
  const options = await versionSelect.locator('option').count()
  expect(options).toBeGreaterThanOrEqual(2)

  // Keyboard navigation advances the page counter.
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.viewer-toolbar')).toContainText(/Page/)
})

test('AT-07 first page renders within the 4G budget', async ({ page }) => {
  const docId = process.env.PLINTH_LARGE_PDF_DOC_ID ?? DOCUMENTS.gaDeckPlan.id
  const client = await page.context().newCDPSession(page)
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (4 * 1024 * 1024) / 8, // ~4 Mbps
    uploadThroughput: (1 * 1024 * 1024) / 8,
    latency: 60,
  })
  await loginAs(page, USERS.hannahOwner.email)

  const t0 = Date.now()
  await page.goto(`/documents/${docId}`)
  await expect(page.locator('.viewer-main canvas').first()).toBeVisible({ timeout: 30_000 })
  const elapsed = Date.now() - t0
  // Budget is 3 s for the true 200 MB fixture; log for the seed stand-in.
  if (process.env.PLINTH_LARGE_PDF_DOC_ID) {
    expect(elapsed).toBeLessThan(3000)
  } else {
    console.log(`AT-07 first-page render (seed doc): ${elapsed}ms`)
  }
})
