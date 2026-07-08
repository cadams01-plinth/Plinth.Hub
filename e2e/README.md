# Plinth Hub — acceptance tests (Playwright)

Encodes the SPEC §12 catalogue, AT-01…AT-15, plus the §11 PDF performance
budget. One spec file per acceptance test.

## Prerequisites

1. A running Hub (`npm run dev --workspace apps/hub`) with a **seeded**
   Supabase (`supabase db reset` loads `supabase/seed`).
2. Environment:

   | Var | Needed for | Notes |
   |---|---|---|
   | `PLINTH_E2E_BASE_URL` | all | e.g. `http://localhost:3000` |
   | `NEXT_PUBLIC_SUPABASE_URL` | auth/seed helpers | |
   | `SUPABASE_SERVICE_ROLE_KEY` | auth/seed helpers | test harness only |
   | `PLINTH_SSO_PRIVATE_KEY_B64` | AT-14 | mint replay/expiry PLTs |
   | `PLINTH_SSO_KID` | AT-14 | matches the Hub |
   | `PLINTH_DEMO_URL` | AT-04, AT-14 | running `apps/demo` |
   | `STRIPE_SECRET_KEY` | AT-06 (`@stripe`) | test-mode clock |
   | `ANTHROPIC_API_KEY` | AT-10 (`@ai`) | |
   | `CRON_SECRET` | AT-15 purge leg | |
   | `PLINTH_SSO_PREVIOUS_JWK` | AT-13 rotation leg | set on the Hub |
   | `PLINTH_LARGE_PDF_DOC_ID` | AT-07 budget | a real 200 MB drawing doc id |

   Tests whose services aren't configured **skip** (not fail), so a minimal
   `BASE_URL + Supabase` run exercises AT-01/02/03/05/07/08/09/11/12/13.

## Run

```bash
cd e2e
npm install
npx playwright install chromium   # skip in CI images that pre-install it
npm test                          # all
npx playwright test at03-cross-tenant   # one AT
npm run report                    # last HTML report
```

## Auth model

`loginAs(page, email)` mints a real Supabase magic-link action link via the
admin API and drives it through `/auth/callback` — the exact production cookie
mechanism, no fabricated cookies. Seed identities live in
`tests/fixtures/tenants.ts`.

## Coverage map

| AT | File | Runs headless-min? |
|---|---|---|
| AT-01 sign-up→project→upload→preview | `at01-signup-flow.spec.ts` | ✅ |
| AT-02 role allow/deny matrix | `at02-role-matrix.spec.ts` | ✅ |
| AT-03 cross-tenant isolation (UI + API) | `at03-cross-tenant.spec.ts` | ✅ |
| AT-04 trial→SSO→demo→licence | `at04-trial-sso.spec.ts` | needs demo app |
| AT-05 seat exhaustion | `at05-seat-exhaustion.spec.ts` | ✅ |
| AT-06 Stripe test clock | `at06-stripe-clock.spec.ts` | `@stripe` |
| AT-07 PDF viewer + 4G budget | `at07-pdf-viewer.spec.ts` | ✅ (budget needs large fixture) |
| AT-08 version chain + restore | `at08-version-chain.spec.ts` | ✅ |
| AT-09 quota block + meter | `at09-quota.spec.ts` | ✅ |
| AT-10 AI answer/act/injection | `at10-ai.spec.ts` | `@ai` |
| AT-11 impersonation transparency | `at11-impersonation.spec.ts` | ✅ |
| AT-12 audit completeness | `at12-audit-completeness.spec.ts` | ✅ |
| AT-13 JWKS rotation | `at13-jwks-rotation.spec.ts` | ✅ (dual-publish needs rotation) |
| AT-14 PLT replay/expiry | `at14-plt-replay.spec.ts` | needs demo app + key |
| AT-15 recycle bin + purge | `at15-recycle-bin.spec.ts` | ✅ (purge needs CRON_SECRET) |

The pgTAP tenancy + seat + cross-tenant tests in `supabase/tests` cover the
database-layer AT-03/AT-05 invariants independently of the browser suite.
