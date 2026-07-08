# BUILD STATUS — 2026-07-08

Tracks implementation against SPEC §14 phases. Updated at each push.

## Phases 1–6: **implemented**

### Phase 1 — foundations, SSO, shell ✅
- Monorepo (npm workspaces): `apps/hub`, `apps/demo`, `packages/auth-ts`, `packages/auth-py`
- Migrations 0001–0007 verbatim from SPEC §2; +0008 `stripe_events` (§6);
  +0009 storage bucket/policies, `start_trial`, `org_member_emails`;
  +0010 AI message-insert policy + metering RPCs; +0011 read-only super-admin
  visibility for the admin cockpit. Validated against Postgres 16: all 11
  migrations apply, tenancy meta-test passes (RLS + ≥1 policy on every table),
  seat-capacity + trial + metering RPCs behave, seeds load.
- SSO stack (SPEC §3): RS256 PLT, JWKS (1 h cache, rotation dual-publish),
  `/api/sso/launch`, `/api/licence/check`, `@plinth/auth` (TS), `plinth-auth`
  (Py) with offline verify + jti replay. Smoke-tested incl. replay + wrong-aud.
- Auth (magic link), session middleware, onboarding, launcher tile states.
- Service-role quarantine (§4.6): ESLint rule + CI grep guard.

### Phase 2 — commercial ✅
- Stripe checkout / portal / trial (`start_trial` RPC), `/api/entitlements`
  assign/unassign, seat requests, notify-me.
- `/api/webhooks/stripe`: §6 event table verbatim, idempotent via
  `stripe_events`, never-500-on-unknown, over-capacity flags + emails (never
  auto-unassigns), dunning, restore.
- Public catalogue (`/apps`, `/apps/[slug]`), People (members + role editor +
  invites + seat matrix), Billing (subscription cards + storage meter + portal).

### Phase 3 — documents ✅
- Projects / folders / documents UI + APIs.
- Upload pipeline: `upload-url` (quota + MIME allowlist → signed URL) →
  `finalise` (object verify, server-side magic-byte sniff, checksum, commit).
- `download-url` (120 s signed, audited), soft delete / restore / recycle bin.
- PDF viewer (§5): virtualised pages, thumbnail rail, fit-width, ⟵/⟶, zoom,
  print, download, version switcher. pdf.js worker served from `public/`.

### Phase 4 — Ask Plinth ✅
- `/api/ai/chat` streaming (NDJSON), tool schemas verbatim (SPEC §7),
  query tools auto-execute under the user's RLS, act tools → confirmation
  cards executed only via `/api/ai/confirm` (re-validated, single-run guard).
- Metering (`meter_ai_usage`), soft cap 200k / hard cap 2× (§7).
- Injection defence is structural: act tools never run from the model loop.

### Phase 5 — admin console ✅
- Super-admin guard, org list, support cockpit (memberships, subs, storage,
  AI usage, support-access history), catalogue CRUD, feature flags.
- Impersonation start (reason + consent) / stop, gold banner (Shell),
  `impersonation_notice` email to owners on end, owner-visible history (AT-11).

### Phase 6 — polish / ops ✅
- Resend email suite (§8, navy header band, all 11 templates + seat_requested).
- PLINTH_* error-code copy map (§9) + error/not-found pages.
- Crons: trial expiry, audit-partition creation, recycle-bin purge (30 d),
  storage recount, nightly Stripe reconciliation (status self-heal, seat drift
  never self-healed).
- Org audit viewer: filters, humanised actions, CSV export (formula-injection
  guarded), impersonation events badged.

## Branding
- Plinth Resource lockup recreated as SVG (`PlinthLogo.tsx`) + favicon
  (`icon.svg`): navy field, gold bowstring arch + deck, steel hangers, white
  piers on bearing-pad blue. Gold/navy token system, titleblock header strip,
  email header band all matched to the uploaded mark.

## Security & correctness review (self-conducted; parallel agents cut short by API limits)

**P0 — RLS infinite recursion (migration 0013).** The spec's `pmembers_manage`
policy (§2/0005) selects from `project_members` inside a policy *on*
`project_members` → Postgres "infinite recursion detected". It never surfaced
in seed/RPC validation (those run as table owner, RLS bypassed) but breaks
every signed-in request that touches `project_members`: the project page, the
People page, document uploads (`documents_write` reads it), and project
updates. Fixed by moving the self-lookup into a `SECURITY DEFINER` helper
(`auth_is_project_lead`) — the same pattern the spec uses for
`auth_can_see_project`. Validated as authenticated across owner/lead/viewer:
selects, doc inserts, project updates, member management all work; viewer
still blocked from writes.

**Cross-tenant hardening (migration 0012 + route fixes).** The denormalised
`organisation_id` on child tables wasn't bound to the parent project's org:
1. `/api/projects/[id]/members` POST now binds `project_id` to the caller's
   org before insert (RLS with-check validated only `organisation_id`, so a
   foreign project UUID could have leaked document access — AT-03).
2. Upload pipeline now derives tenancy from the project row, not the caller's
   active org context, so a project member acting cross-context can't misfile
   a document or bill the wrong quota.
3. **Defense-in-depth:** composite `(child, organisation_id)` foreign keys make
   an org/project mismatch impossible at the database level regardless of RLS
   or route code — this alone would have blocked both bugs above.

`supabase/tests/0003_cross_tenant_isolation.sql` (AT-03) locks in the RLS
visibility split and the composite-FK rejections.

## Known gaps / next
- Playwright AT harness (AT-01…AT-15) is specified in SPEC §12 but not yet in
  the repo — needs a running Supabase + browsers; pgTAP tenancy + seat tests
  ship in `supabase/tests`.
- Entra ID + TOTP MFA: schema-ready (`mfa_required`); wiring is Phase 2+ auth.
- `PLINTH_HUB_BUILD.md` (master doc) unrecoverable — CLAUDE.md reconstructs it;
  catalogue seed carries `TODO(verify)` on the four §13 items pending Chris.
