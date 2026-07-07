# PLINTH_HUB_BUILD.md — Master Build Instructions

> **Provenance note.** The original Master Build Instructions (v1, April 2026) were lost
> alongside Spec v1. This file reconstructs the rules of engagement from
> **docs/SPEC.md (Build Specification v2.0, July 2026)**, which is definitive for the
> *how*. Sections of the original master doc that SPEC.md references but that were not
> recoverable (design system tokens §5–6, auth detail §9, admin console §14, the app
> catalogue §16, phase plan §19, launkthrough §21) are marked **[TO RESTORE]** below —
> Chris to supply; until then the placeholder decisions documented here apply.

## Document hierarchy (SPEC §0)

1. Plinth Hub Launch Plan (July 2026) — commercial/entity context (not in repo).
2. **This file** — the what, the order, the rules of engagement.
3. **docs/SPEC.md** — the exact how: schema, RLS, SSO protocol, API surface,
   webhooks, AI tools, acceptance tests. Where this file says "see spec", SPEC.md wins.

SPEC §15 (DO-NOT-BUILD) is law. Every feature request is triaged against it first;
if listed, it goes to ROADMAP.md with a date-stamped note and the build continues.

## Rules of engagement

- **Tenancy first.** Every tenant table carries `organisation_id`. RLS is enabled in the
  same migration that creates each table. The pgTAP tenancy meta-test
  (`supabase/tests/0001_tenancy_meta.sql`) must stay green on every migration.
- **Service-role quarantine (SPEC §4.6).** `apps/hub/src/lib/supabase/admin.ts` is the
  only module that instantiates the service-role client. ESLint `no-restricted-imports`
  plus `scripts/check-service-role-quarantine.sh` (run in CI) enforce the allowlist.
- **The browser is untrusted.** No service keys, no unverified org ids, no unsigned URLs
  client-side. SSO tokens travel in the URL *fragment*, never the query string.
- **Every state change audits.** One `log_audit` call per state-changing route (AT-12).
- **Errors are coded.** Non-2xx responses carry a `PLINTH_*` code from SPEC §9.
- **UK English** throughout UI copy, emails, and docs.

## Repo layout

```
apps/hub            Next.js 14 (App Router) — public site · app · admin
apps/demo           Minimal suite app: verifies the PLT via @plinth/auth (AT-04 leg)
packages/auth-ts    @plinth/auth — TS verifier for suite apps (JWKS, replay cache)
packages/auth-py    plinth-auth — Python verifier for suite apps
supabase/migrations 0001–0007 per SPEC §2 (+0008 stripe_events for SPEC §6)
supabase/tests      pgTAP, incl. the tenancy meta-test
supabase/seed       apps.sql catalogue + dev fixtures (SPEC §13)
scripts             CI guards
```

## Placeholder decisions pending [TO RESTORE] sections

- **Design system:** navy/ink palette with a "titleblock" header strip, system font
  stack, generous whitespace. Replace with the real tokens when §5–6 are restored.
- **Auth (§9):** Supabase Auth with email magic link + password; Entra ID and TOTP MFA
  wired in Phase 2+. `mfa_required` on organisations is respected at sign-in.
- **Catalogue (§16):** `supabase/seed/apps.sql` seeds ITP Engine, Bid Studio and the
  demo app with TODO markers on the four verification items called out in SPEC §13.

## Phases (§19 reconstruction — matches SPEC §14 prompts)

P1 foundations: monorepo, migrations, pgTAP, auth, shell, SSO stack, demo app
   → AT-02, AT-03, AT-04 (demo leg), AT-13, AT-14.
P2 commercial: catalogue, public pages, Stripe, trials, seats, licence budget
   → AT-04, AT-05, AT-06.
P3 documents: projects/folders/documents, upload pipeline, PDF viewer, quotas, bin
   → AT-01, AT-07, AT-08, AT-09, AT-15.
P4 Ask Plinth → AT-10.  P5 admin console + impersonation → AT-11.
P6 polish, emails, error UI, ops, ZAP, full AT run.

## Build status

See BUILD_STATUS.md for what is implemented vs stubbed at any point in time.
