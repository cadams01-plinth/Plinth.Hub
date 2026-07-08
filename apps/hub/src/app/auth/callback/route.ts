import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

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

/**
 * Open-redirect-safe resolution of the post-login `next` param. A prefix
 * check like `startsWith('/') && !startsWith('//')` is bypassable: the WHATWG
 * URL parser normalises backslashes to slashes for special schemes, so
 * `/\evil.com` resolves to `https://evil.com/`. Resolve against the request
 * origin and only accept same-origin targets, returning the path+query only.
 */
function safeNext(next: string, base: string): string {
  try {
    const resolved = new URL(next, base)
    if (resolved.origin === new URL(base).origin) {
      return resolved.pathname + resolved.search
    }
  } catch {
    // fall through
  }
  return '/launcher'
}
