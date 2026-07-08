#!/usr/bin/env bash
# Service-role quarantine guard — SPEC §4.6.
# Fails CI if SUPABASE_SERVICE_ROLE_KEY (or the admin client module) is
# referenced outside the allowlisted paths.
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOWED_REGEX='^(apps/hub/src/lib/supabase/admin\.ts|apps/hub/src/lib/env\.ts|apps/hub/src/lib/audit\.ts|apps/hub/src/app/api/(webhooks|cron|sso|admin|licence|orgs|documents)/|apps/hub/src/app/api/auth/invite/|\.env\.example|README\.md|CLAUDE\.md|docs/|scripts/)'

violations=$(grep -rln --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  --exclude-dir='.next' --exclude-dir='dist' --exclude-dir='node_modules' \
  -e 'SUPABASE_SERVICE_ROLE_KEY' -e 'lib/supabase/admin' \
  apps packages 2>/dev/null | grep -vE "$ALLOWED_REGEX" || true)

if [[ -n "$violations" ]]; then
  echo "SERVICE-ROLE QUARANTINE VIOLATION (SPEC §4.6) — key or admin client referenced in:"
  echo "$violations"
  exit 1
fi
echo "Quarantine check passed."
