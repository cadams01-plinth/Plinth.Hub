# BUILD STATUS — 2026-07-07

Tracks implementation against SPEC §14 phases. Updated at each push.

## Phase 1 — foundations, SSO, shell: **implemented**

- ✅ Monorepo scaffold (npm workspaces): `apps/hub`, `apps/demo`,
  `packages/auth-ts`, `packages/auth-py`
- ✅ Migrations 0001–0007 verbatim from SPEC §2 (+0008: `stripe_events`
  idempotency store required by §6, and the audit partition cron function).
  Helper functions live at the end of 0002 per the ordering note in §2;
  RLS explicitly enabled on audit partitions.
- ✅ pgTAP: tenancy meta-test + seat-capacity trigger test
- ✅ SSO stack (SPEC §3): RS256 PLT mint, JWKS at
  `/.well-known/plinth-sso.json` (1 h cache, dual-publish rotation support),
  `/api/sso/launch` (entitlement check, fragment delivery, audit),
  `/api/licence/check` (offline verify + live entitlement re-check)
- ✅ `@plinth/auth` (TS) and `plinth-auth` (Py): offline JWKS verification,
  iss/aud/exp/ver checks, jti replay cache, SPEC §9 error codes
- ✅ Demo suite app (AT-04 leg) consuming `@plinth/auth`
- ✅ Auth: magic-link sign-in, callback, middleware session refresh
- ✅ Shell: landing, sign-in, onboarding (org creation), launcher with
  SPEC §5 tile states
- ✅ `/api/orgs`, `/api/auth/invite/accept`, `/api/cron/partitions`
- ✅ Service-role quarantine: ESLint rule + CI grep script
- ✅ Seed: catalogue (§13, with TODO(verify) markers where PLINTH_HUB_BUILD.md
  §16 is lost) + dev fixtures (two orgs, five users, projects, documents)

### Phase 1 gaps / notes
- Entra ID + TOTP MFA: schema-ready (`mfa_required`), wiring pending.
- Acceptance tests AT-02/03/04/13/14 are specified but Playwright harness is
  not yet in repo (needs running Supabase + two browsers; next task).
- `PLINTH_HUB_BUILD.md` (master doc) was not recoverable — CLAUDE.md
  reconstructs it and marks [TO RESTORE] sections. Catalogue entries and the
  design tokens are placeholders pending Chris's originals.

## Phase 2 — commercial: **not started**
Stripe checkout/portal/webhooks (§6), trials, public catalogue pages, seat UI.
(`stripe_events` table and seat-capacity trigger already in place.)

## Phase 3 — documents: **schema only**
Tables/RLS/quota trigger shipped in 0005; upload pipeline, PDF viewer,
recycle bin pending.

## Phase 4 — Ask Plinth: **schema only** (0006)

## Phase 5 — admin console: **schema only** (0007; impersonation transparency
policy live in DB)

## Phase 6 — polish/ops: **not started** (RUNBOOK skeleton exists)
