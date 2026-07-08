import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrgContext } from '@/lib/org'
import { logAudit } from '@/lib/audit'
import { plinthError, validationError } from '@/lib/errors'

const bodySchema = z.object({ app_slug: z.string().min(1) })

/** "Notify me" on a coming-soon tile — recorded for launch outreach. */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  await logAudit({
    organisationId: ctx.organisationId,
    actorUserId: ctx.user.id,
    actorType: 'user',
    action: 'app.notify_me',
    targetType: 'app',
    targetId: parsed.data.app_slug,
    metadata: { email: ctx.user.email },
  })
  return NextResponse.json({ ok: true })
}
