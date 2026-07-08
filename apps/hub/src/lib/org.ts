import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface OrgContext {
  user: { id: string; email: string }
  organisationId: string
  role: OrgRole
  org: {
    id: string
    name: string
    slug: string
    billing_status: string
    storage_quota_bytes: number
    storage_used_bytes: number
    ai_enabled: boolean
  }
  memberships: { organisation_id: string; role: OrgRole; name: string }[]
  isSuperAdmin: boolean
}

export const ORG_COOKIE = 'plinth_org'

/**
 * Resolve the signed-in user's acting organisation under their RLS context.
 * Order: plinth_org cookie (if still a member) → profile default → single
 * membership. Returns null when signed out or memberless (→ onboarding).
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: memberships }, { data: profile }, { data: superAdmin }] =
    await Promise.all([
      supabase
        .from('organisation_members')
        .select(
          'organisation_id, role, organisations(id, name, slug, billing_status, storage_quota_bytes, storage_used_bytes, ai_enabled)',
        )
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('default_organisation_id')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle(),
    ])

  if (!memberships || memberships.length === 0) return null

  const cookieOrg = cookies().get(ORG_COOKIE)?.value
  const chosen =
    memberships.find((m) => m.organisation_id === cookieOrg) ??
    memberships.find((m) => m.organisation_id === profile?.default_organisation_id) ??
    memberships[0]

  const org = chosen.organisations as unknown as OrgContext['org']
  return {
    user: { id: user.id, email: user.email ?? '' },
    organisationId: chosen.organisation_id,
    role: chosen.role as OrgRole,
    org,
    memberships: memberships.map((m) => ({
      organisation_id: m.organisation_id,
      role: m.role as OrgRole,
      name: (m.organisations as unknown as { name: string }).name,
    })),
    isSuperAdmin: Boolean(superAdmin),
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
