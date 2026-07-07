# RUNBOOK

## Key rotation

### SSO keypair (SPEC §3, §10)
1. Generate new RSA keypair; choose a new `kid` (date-stamped).
2. Export the *current* public key as a JWK and set `PLINTH_SSO_PREVIOUS_JWK`
   (include its old `kid`).
3. Set `PLINTH_SSO_PRIVATE_KEY_B64` + `PLINTH_SSO_KID` to the new pair. Deploy.
   JWKS now dual-publishes both keys (AT-13).
4. After 24 h, clear `PLINTH_SSO_PREVIOUS_JWK`. Deploy.

### Stripe webhook secret
Roll in the Stripe dashboard; update `STRIPE_WEBHOOK_SECRET`; redeploy; confirm the
next event verifies.

### Supabase service-role key
Rotate in Supabase dashboard; update `SUPABASE_SERVICE_ROLE_KEY` in Vercel; redeploy.
The quarantine (SPEC §4.6) means only the allowlisted modules are affected.

## Backups & restore drill (SPEC §10)

Supabase PITR is enabled on prod. **Quarterly restore drill into staging** — evidence
each drill here:

| Date | Restored to | PITR point | Verified by | Notes |
|---|---|---|---|---|
| _first drill due Q3 2026_ | | | | |

## Audit-log partitions

Monthly partitions exist through 2026-09. A cron (`/api/cron/partitions`) creates next
month's partition on the 25th — it must also `enable row level security` on the new
partition (the tenancy meta-test checks every table).

## Incident basics

- Sentry alerts: error-rate spike, any `PLINTH_TOKEN_REPLAY`.
- Uptime checks: `/`, `/api/licence/check` (synthetic token), JWKS.
