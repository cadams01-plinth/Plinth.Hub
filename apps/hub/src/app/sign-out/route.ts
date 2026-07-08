import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    await logAudit({
      organisationId: null,
      actorUserId: user.id,
      actorType: 'user',
      action: 'auth.logout',
    })
    await supabase.auth.signOut()
  }
  return NextResponse.redirect(new URL('/', request.url))
}
