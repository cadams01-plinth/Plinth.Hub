import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Super-admin guard (SPEC §4: SA routes). Verified against the super_admins
 * table under the caller's own RLS on every request — never trusted from a
 * cookie or claim. MFA enforcement joins in Phase 2+ auth hardening.
 */
export async function requireSuperAdmin(): Promise<{ userId: string; email: string } | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) return null
  return { userId: user.id, email: user.email ?? '' }
}
