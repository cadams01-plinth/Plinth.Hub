import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

/**
 * Catalogue CRUD — SPEC §4 /api/admin/*. Writes run under the super admin's
 * own RLS context (apps_admin_write policy) — no service role needed.
 */

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  one_liner: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  status: z.enum(['live', 'beta', 'coming_soon', 'hidden']),
  app_url: z.string().url().nullable().optional(),
  redirect_urls: z.array(z.string().url()).max(10).optional(),
  sort_order: z.number().int().optional(),
})

export async function POST(request: NextRequest) {
  const sa = await requireSuperAdmin()
  if (!sa) return plinthError('PLINTH_FORBIDDEN')

  const parsed = upsertSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { id, ...fields } = parsed.data

  const supabase = createClient()
  const query = id
    ? supabase.from('apps').update(fields).eq('id', id).select('id, slug').single()
    : supabase.from('apps').insert(fields).select('id, slug').single()
  const { data: app, error } = await query
  if (error || !app) return plinthError('PLINTH_VALIDATION', error?.message ?? 'Save failed')

  await logAudit({
    organisationId: null,
    actorUserId: sa.userId,
    actorType: 'super_admin',
    action: id ? 'catalogue.app_updated' : 'catalogue.app_created',
    targetType: 'app',
    targetId: app.slug,
    metadata: fields,
  })
  return NextResponse.json({ app }, { status: id ? 200 : 201 })
}
