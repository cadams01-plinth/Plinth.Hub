import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActorType = 'user' | 'super_admin' | 'system' | 'ai'

/**
 * Append to the audit log (SPEC §2, 0001). Every state-changing route calls
 * this exactly once (AT-12). Inserts go through the security-definer
 * log_audit function; the table itself is append-only.
 */
export async function logAudit(params: {
  organisationId: string | null
  actorUserId: string | null
  actorType: ActorType
  action: string // dot-namespaced: 'auth.login', 'sso.launch', …
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('log_audit', {
    p_org: params.organisationId,
    p_actor: params.actorUserId,
    p_actor_type: params.actorType,
    p_action: params.action,
    p_target_type: params.targetType ?? null,
    p_target_id: params.targetId ?? null,
    p_metadata: params.metadata ?? {},
  })
  if (error) {
    // Audit failures must be loud in observability but never mask the
    // user-facing operation; Sentry picks this up server-side.
    console.error('audit_log write failed', params.action, error)
  }
}
