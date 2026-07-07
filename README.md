# Plinth Hub

The Plinth Resource suite hub — identity, tenancy, catalogue, billing, documents and
SSO for the suite apps at `*.plinthresource.com`.

- **Spec:** `docs/SPEC.md` (Build Specification v2.0 — definitive)
- **Master instructions:** `CLAUDE.md`
- **Status:** `BUILD_STATUS.md`

## Stack

Next.js 14 (App Router) on Vercel · Supabase (London eu-west-2): Auth, Postgres + RLS,
Storage · Stripe · Anthropic · Resend · Sentry.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in Supabase keys + a generated SSO keypair
npx supabase start                # local stack
npx supabase db reset             # applies migrations + seed
npm run dev                       # hub on :3000
npm run dev --workspace apps/demo # demo suite app on :4000
```

Generate an SSO keypair for local dev:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | base64 -w0
# → PLINTH_SSO_PRIVATE_KEY_B64
```

## Tests

- `npm run typecheck && npm run lint`
- `npm run quarantine-check` — SPEC §4.6 service-role key guard
- `npx supabase test db` — pgTAP, incl. the tenancy meta-test (SPEC §2)
