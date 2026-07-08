import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BrowserContext, Page } from '@playwright/test'
import { baseURL } from './tenants'

/**
 * Test auth helpers. Real cookie sessions via Supabase magic-link action
 * links (@supabase/ssr cookie mechanism, exactly as production) — no
 * fabricated cookies. Requires SUPABASE_SERVICE_ROLE_KEY for the admin API.
 */

let cachedAdmin: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('E2E needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  }
  cachedAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return cachedAdmin
}

/** Sign the page in as `email` via a real magic-link action link → cookie session. */
export async function loginAs(page: Page, email: string, next = '/launcher'): Promise<void> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseURL}/auth/callback?next=${encodeURIComponent(next)}` },
  })
  if (error || !data?.properties?.action_link) {
    throw new Error(`generateLink failed for ${email}: ${error?.message}`)
  }
  await page.goto(data.properties.action_link)
  await page.waitForURL(`**${next}`, { timeout: 20_000 })
}

export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies()
}

/** Grant super-admin for the impersonation tests, then revoke in teardown. */
export async function grantSuperAdmin(userId: string): Promise<void> {
  const admin = adminClient()
  await admin.from('super_admins').upsert({ user_id: userId }, { onConflict: 'user_id' })
}
export async function revokeSuperAdmin(userId: string): Promise<void> {
  await adminClient().from('super_admins').delete().eq('user_id', userId)
}
