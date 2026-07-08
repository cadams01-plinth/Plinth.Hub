# Security

## Reporting
Email `Chris@plinthresource.com`. Do not open public issues for vulnerabilities.

## Built-in controls (SPEC §1, §4.6)
- **Tenant isolation:** every tenant table carries `organisation_id`, RLS is
  enabled in the migration that creates it, and composite `(child,
  organisation_id)` FKs (migration 0012) make org/project mismatches
  impossible. Enforced by the pgTAP tenancy meta-test + AT-03 isolation test.
- **Service-role quarantine (§4.6):** the service-role client is importable
  only from an allowlist; ESLint `no-restricted-imports` + a CI grep enforce it.
- **SSO:** RS256 PLTs (10-min, `jti` replay cache), tokens in the URL fragment,
  redirect URLs exact-match allowlisted, open-redirect-safe `next` handling.
- **AI:** act-tools never execute from the model loop — only via
  `/api/ai/confirm` with a fresh permission check (structural injection defence).
- **Every state change audits** (§4, AT-12). Errors carry `PLINTH_*` codes (§9).

## Known dependency advisories (as of 2026-07)

`npm audit --omit=dev` reports advisories against **Next.js** (and its
transitive `postcss`). We run the latest 14.x patch release (**14.2.35**).
The flagged advisories are only fully resolved in **Next ≥ 15.5.16**, which is
a major upgrade (see remediation below).

**Practical exposure on the intended deployment (Vercel) is low:**

| Advisory class | Applicability here |
|---|---|
| Image Optimizer DoS / cache growth (`remotePatterns`) | We don't proxy untrusted remote images; Vercel's image layer mitigates. |
| RSC / Server-Component DoS, cache-poisoning | Largely mitigated by Vercel's edge/CDN; no untrusted RSC cache keys. |
| Middleware/Proxy **i18n** bypass | **N/A** — the app uses no i18n routing. |
| XSS via **CSP nonces** | **N/A** — no nonce-based CSP in use. |
| XSS via **`beforeInteractive`** scripts with untrusted input | **N/A** — no `beforeInteractive` scripts. |
| `next/image` SSRF via WebSocket upgrades | Not used. |
| postcss `</style>` stringify XSS | Build-time only (our CSS is static, first-party). |

None of the XSS/bypass advisories map to a feature this app uses; the
remainder are DoS/cache classes materially mitigated by the Vercel platform.

### Remediation plan
Upgrade to **Next 15 (≥15.5.16)**. This is deferred as a tracked task rather
than done blind because it is a wide, breaking migration (async
`cookies()`/`params`/`searchParams` cascades through every `createClient()`
caller and dynamic route/page — ~50 files) that must be **runtime-tested**
against a live Supabase, which the build container cannot host. Steps:
1. `next@^15.5` + `eslint-config-next@^15.5`.
2. `npx @next/codemod@latest next-async-request-api .` then reconcile
   `lib/supabase/server.ts` (`await cookies()`, make `createClient()` async)
   and every caller (`await createClient()`).
3. `npm run typecheck && npm run lint && npm run build && npm run test`.
4. Run the Playwright AT suite (`e2e/`) against a live stack.
5. `npm audit --omit=dev` → expect clean.

Until then, 14.2.35 is the safest release on the 14.x line and the residual
advisories are mitigated as tabled above.
