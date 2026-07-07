import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'

/**
 * SERVICE-ROLE QUARANTINE — SPEC §4.6.
 *
 * This is the ONLY module in the codebase that instantiates the service-role
 * client. It bypasses RLS entirely. It may be imported only from:
 *   api/webhooks/**  api/cron/**  api/sso/**  api/auth/invite/**
 *   api/admin/** (re-verifies super_admins first)  api/licence/**
 *   api/orgs/** (sign-up org creation)  the upload finaliser  lib/audit.ts
 * Enforced by ESLint no-restricted-imports and scripts/check-service-role-quarantine.sh.
 */
export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = serverEnv()
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
