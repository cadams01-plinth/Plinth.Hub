import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { safeNext } from '@/lib/safe-redirect'

export const dynamic = 'force-dynamic'

/** Magic-link / OAuth code exchange. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = request.nextUrl.searchParams.get('next') ?? '/launcher'

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await logAudit({
        organisationId: null,
        actorUserId: data.user.id,
        actorType: 'user',
        action: 'auth.login',
      })
      return NextResponse.redirect(new URL(safeNext(next, request.url), request.url))
    }
  }
  return NextResponse.redirect(new URL('/sign-in?error=link_invalid', request.url))
}
