import { test, expect } from '@playwright/test'

/**
 * AT-06 — Stripe test-clock: trial expiry, renewal, payment failure → dunning
 * → restore. Requires Stripe test keys + a configured webhook; tagged @stripe
 * and skipped unless STRIPE_SECRET_KEY is present.
 *
 * The webhook handler logic (SPEC §6) is exercised by driving Stripe test
 * clocks and asserting the resulting DB state. This spec documents the steps;
 * wiring the test clock needs the Stripe SDK in the harness.
 */
test.describe('@stripe AT-06 Stripe lifecycle via test clock', () => {
  test.skip(!process.env.STRIPE_SECRET_KEY, 'set STRIPE_SECRET_KEY to run')

  test('payment_failed moves org to past_due, invoice.paid restores active', async () => {
    // 1. Create a test-clock customer + subscription for a seeded org.
    // 2. Advance the clock past the renewal; simulate a failed payment.
    // 3. Assert organisations.billing_status === 'past_due' and a dunning
    //    timestamp in settings; owner received payment_failed email.
    // 4. Pay the invoice; advance; assert billing_status === 'active' and the
    //    dunning marker cleared (subscription_restored email sent).
    test.fixme(true, 'Requires Stripe test-clock harness wiring (SPEC §12 AT-06)')
  })

  test('subscription.updated with reduced seats flags over-capacity, never auto-unassigns', async () => {
    // Assign N seats, reduce the Stripe quantity below N, assert the org is
    // flagged seats_over_capacity and admins emailed, and that no entitlement
    // rows were deleted (SPEC §6).
    test.fixme(true, 'Requires Stripe test-clock harness wiring (SPEC §12 AT-06)')
  })
})
