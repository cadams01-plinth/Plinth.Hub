# Plinth Hub — Deployment & Operations Guide

End-to-end setup for a production Plinth Hub: Supabase (London), Vercel,
Stripe, Resend, Anthropic, and the suite-app SSO integration. Pairs with
`RUNBOOK.md` (rotation, restore drills, incident basics) and `docs/SPEC.md`
(the definitive build spec).

> **Audience:** whoever stands up the environment. Assumes accounts on
> Supabase, Vercel, Stripe, Resend, Anthropic, and a domain you control
> (`plinthresource.com` in these examples).

---

## 0. Architecture recap (SPEC §1)

```
hub.plinthresource.com  (Next.js 14 on Vercel: public site · app · admin)
   │  RS256 SSO JWT (10 min) + /.well-known/plinth-sso.json (JWKS)
   ▼
Supabase — London (eu-west-2): Auth · Postgres + RLS · Storage(project-documents)
   │  webhooks
   ▼
Stripe · Anthropic · Resend · Sentry
```

Three trust boundaries only: the browser is untrusted; suite apps trust a
validly-signed Hub JWT and re-check entitlements ≤ hourly; the service-role
key lives only in quarantined server modules (SPEC §4.6).

---

## 1. Prerequisites

- Node 20+, the Supabase CLI (`npm i -g supabase`), and `openssl`.
- A Supabase project in **London (eu-west-2)** — data residency matters.
- A Vercel project linked to this repo (root `apps/hub`).
- Stripe, Resend, and Anthropic accounts with API keys.
- DNS control for `plinthresource.com` (Hub + one subdomain per suite app).

---

## 2. Supabase

### 2.1 Create the project
Region **London (eu-west-2)**. Note the project ref, API URL, `anon` key, and
`service_role` key.

### 2.2 Apply migrations + seed
```bash
supabase link --project-ref <ref>
supabase db push                     # applies supabase/migrations 0001–0014 in order
psql "$DATABASE_URL" -f supabase/seed/apps.sql   # catalogue ONLY in prod
# Do NOT load supabase/seed/dev_fixtures.sql in production.
```
The tenancy meta-test must be green (`supabase test db` in CI). Migrations
enable RLS in the same migration that creates each table; the composite
tenancy FKs (0012) and the `pmembers_manage` recursion fix (0013) are
load-bearing — do not skip or reorder.

### 2.3 Storage bucket
Migration 0009 creates the private `project-documents` bucket and its
path-prefix read policy. Confirm in Studio → Storage that the bucket exists
and is **private**. All uploads/downloads flow through server actions that
mint short-lived signed URLs (upload 600 s, download 120 s) — the bucket
policy is defence-in-depth, never the sole gate.

### 2.4 Auth
Studio → Authentication:
- **Email** provider on; magic link enabled. (Password + Entra ID + TOTP MFA
  are Phase 2+; `mfa_required` is schema-ready.)
- **Site URL:** `https://hub.plinthresource.com`
- **Redirect URLs:** add `https://hub.plinthresource.com/auth/callback`
- Configure SMTP (or use Supabase's) for auth emails; product emails go via
  Resend (§5).

### 2.5 First super admin
There is no bootstrap UI (by design). After a real user signs in once:
```sql
insert into super_admins (user_id)
  values ('<auth.users.id of the first admin>');
```
That user now sees `/admin`.

---

## 3. SSO keypair (SPEC §3)

Generate an RS256 keypair; the private key signs PLTs, the public half is
published as JWKS.
```bash
# Private key, base64'd to survive env-var newlines:
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | base64 -w0
#   → PLINTH_SSO_PRIVATE_KEY_B64
```
Set `PLINTH_SSO_KID` to a date-stamped id (e.g. `plinth-sso-2026-07`). Leave
`PLINTH_SSO_PREVIOUS_JWK` empty except during a rotation window (see
`RUNBOOK.md` — 24 h dual-publish).

Verify after deploy:
```bash
curl https://hub.plinthresource.com/.well-known/plinth-sso.json
# → {"keys":[{"kty":"RSA","kid":"plinth-sso-2026-07","use":"sig","alg":"RS256",…}]}
```

---

## 4. Stripe (SPEC §6)

1. Create a **Product** per paid app; add a **Price** (per-seat, GBP,
   monthly/annual). Record each `price` id.
2. Insert the catalogue rows so the Hub can offer them:
   ```sql
   update apps set stripe_product_id = 'prod_…' where slug = 'itp-engine';
   insert into app_prices (app_id, stripe_price_id, billing_interval, unit_amount_pence, active)
     select id, 'price_…', 'month', 4900, true from apps where slug = 'itp-engine';
   ```
3. **Webhook:** add an endpoint → `https://hub.plinthresource.com/api/webhooks/stripe`,
   subscribe to: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`,
   `customer.subscription.trial_will_end`. Copy the signing secret →
   `STRIPE_WEBHOOK_SECRET`.
4. The handler is idempotent (`stripe_events`) and never 500s on unknown
   events. The nightly reconcile cron self-heals status drift only — seat
   drift is flagged for human review, never auto-corrected.

---

## 5. Resend & Anthropic

- **Resend:** verify the `plinthresource.com` domain; set `RESEND_API_KEY`.
  From `hub@plinthresource.com`, reply-to `Chris@plinthresource.com`. Without
  the key the app runs but logs `[email skipped]` instead of sending.
- **Anthropic:** set `ANTHROPIC_API_KEY`. Ask Plinth uses `claude-opus-4-8`.
  Without the key `/api/ai/chat` returns `PLINTH_AI_DISABLED`. Per-org daily
  caps: soft 200k tokens, hard 400k (SPEC §7).

---

## 6. Vercel environment variables

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | never `NEXT_PUBLIC_`; §4.6 quarantine |
| `NEXT_PUBLIC_HUB_URL` | all | `https://hub.plinthresource.com` |
| `PLINTH_SSO_PRIVATE_KEY_B64` | server | §3 |
| `PLINTH_SSO_KID` | server | e.g. `plinth-sso-2026-07` |
| `PLINTH_SSO_PREVIOUS_JWK` | server | empty except during rotation |
| `STRIPE_SECRET_KEY` | server | |
| `STRIPE_WEBHOOK_SECRET` | server | |
| `ANTHROPIC_API_KEY` | server | |
| `RESEND_API_KEY` | server | |
| `CRON_SECRET` | server | high-entropy; guards `/api/cron/*` |

Vercel project root: `apps/hub`. Build command `npm run build` (root script
builds `@plinth/auth` then the hub). The `prebuild` step copies the pdf.js
worker into `public/`.

---

## 7. Cron jobs (SPEC §4)

Schedule these `POST`s with `Authorization: Bearer $CRON_SECRET`. On Vercel,
add to `vercel.json` (or use the Vercel Cron UI):

```json
{
  "crons": [
    { "path": "/api/cron/trials",           "schedule": "0 6 * * *" },
    { "path": "/api/cron/purge-bin",         "schedule": "30 3 * * *" },
    { "path": "/api/cron/storage-recount",   "schedule": "0 4 * * 0" },
    { "path": "/api/cron/stripe-reconcile",  "schedule": "0 2 * * *" },
    { "path": "/api/cron/partitions",        "schedule": "0 5 25 * *" }
  ]
}
```
Vercel cron sends its own auth header — set `CRON_SECRET` and confirm the
routes reject calls without it (they use a constant-time compare). The
`partitions` job creates next month's `audit_log` partition *and* enables RLS
on it (the meta-test checks every table).

---

## 8. Suite-app integration (SPEC §3)

For each suite app (e.g. ITP Engine at `itp.plinthresource.com`):
1. In the Hub catalogue, set `apps.app_url` and add the exact SSO callback to
   `apps.redirect_urls` (exact-match allowlist; add via `/admin/catalogue`).
2. In the suite app, verify PLTs offline with `@plinth/auth` (TS) or
   `plinth-auth` (Py), pointing at
   `https://hub.plinthresource.com/.well-known/plinth-sso.json`. The app
   verifies signature + `iss` + `aud`(its slug) + `exp`, rejects a replayed
   `jti` (10-min cache), establishes its own session, and discards the PLT.
3. Re-check entitlement at most hourly via
   `GET /api/licence/check?app={slug}` with a still-valid PLT.

The `apps/demo` app is a runnable reference; `apps/demo/test/sso-integration.mjs`
exercises the full accept/replay/expiry/wrong-aud path.

---

## 9. Post-deploy smoke test

```bash
curl -f https://hub.plinthresource.com/                       # public site
curl -f https://hub.plinthresource.com/.well-known/plinth-sso.json | jq .keys[0].kid
curl -f https://hub.plinthresource.com/apps                   # catalogue
```
Then in a browser: sign in (magic link) → create org → create project →
upload a PDF → preview it → open `/admin` as the seeded super admin. For the
scripted version, run the Playwright suite (`e2e/`) against the live URL with
`PLINTH_E2E_BASE_URL` set (see `e2e/README.md`).

---

## 10. Observability (SPEC §10)

- Sentry (client + server), release-tagged. Alert on error-rate spikes and on
  **any** `PLINTH_TOKEN_REPLAY`.
- Structured request logs carry no tokens, no signed URLs, no filenames in
  query strings (the fragment-based SSO design exists for this).
- Uptime checks: `/`, `/api/licence/check` (synthetic token), the JWKS
  endpoint. Public status page.
- Backups: Supabase PITR on prod; quarterly restore drill into staging,
  evidenced in `RUNBOOK.md`.

---

## 11. Go-live checklist

- [ ] Migrations 0001–0014 applied; `supabase test db` green.
- [ ] `project-documents` bucket private; storage policy present.
- [ ] Catalogue seeded; `TODO(verify)` items in `apps.sql` confirmed with Chris.
- [ ] SSO keypair set; JWKS serves the expected `kid`.
- [ ] Stripe products/prices created and mapped in `app_prices`; webhook verified.
- [ ] Resend domain verified; Anthropic key set.
- [ ] All Vercel env vars set; `SUPABASE_SERVICE_ROLE_KEY` server-only.
- [ ] Cron jobs scheduled with `CRON_SECRET`.
- [ ] First super admin inserted.
- [ ] Sentry + uptime checks live; PITR enabled.
- [ ] Smoke test + Playwright AT run green against the live URL.
- [ ] Rotation + restore-drill procedures reviewed (`RUNBOOK.md`).
