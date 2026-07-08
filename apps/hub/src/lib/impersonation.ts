import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const IMPERSONATION_COOKIE = 'plinth_imp'

/**
 * Active support-impersonation session for the current super admin, if any
 * (AT-11). Read under the user's own RLS context — the select policy on
 * impersonation_sessions already covers super admins.
 */
export async function getActiveImpersonation(): Promise<{
  id: string
  organisationId: string
  organisationName: string
} | null> {
  const sessionId = cookies().get(IMPERSONATION_COOKIE)?.value
  if (!sessionId) return null

  const supabase = createClient()
  const { data } = await supabase
    .from('impersonation_sessions')
    .select('id, organisation_id, ended_at, organisations(name)')
    .eq('id', sessionId)
    .is('ended_at', null)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    organisationId: data.organisation_id,
    organisationName: (data.organisations as unknown as { name: string })?.name ?? '',
  }
}
