import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import { plinthError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

function csvCell(value: unknown): string {
  const s = String(value ?? '')
  // Formula-injection guard + quoting
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${guarded.replace(/"/g, '""')}"`
}

/** CSV export of the org audit log — SPEC §5. Reads under the caller's RLS. */
export async function GET(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!['owner', 'admin'].includes(ctx.role)) return plinthError('PLINTH_FORBIDDEN')

  const params = request.nextUrl.searchParams
  const supabase = createClient()
  let query = supabase
    .from('audit_log')
    .select('occurred_at, actor_user_id, actor_type, action, target_type, target_id, metadata')
    .eq('organisation_id', ctx.organisationId)
    .order('occurred_at', { ascending: false })
    .limit(5000)
  if (params.get('action')) query = query.eq('action', params.get('action')!)
  if (params.get('actor')) query = query.eq('actor_user_id', params.get('actor')!)
  if (params.get('from')) query = query.gte('occurred_at', params.get('from')!)
  if (params.get('to')) query = query.lte('occurred_at', `${params.get('to')!}T23:59:59Z`)

  const { data: rows, error } = await query
  if (error) return plinthError('PLINTH_VALIDATION', 'Export failed')

  const header = 'occurred_at,actor_user_id,actor_type,action,target_type,target_id,metadata'
  const lines = (rows ?? []).map((r) =>
    [r.occurred_at, r.actor_user_id, r.actor_type, r.action, r.target_type, r.target_id, JSON.stringify(r.metadata)]
      .map(csvCell)
      .join(','),
  )
  return new Response([header, ...lines].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plinth-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
