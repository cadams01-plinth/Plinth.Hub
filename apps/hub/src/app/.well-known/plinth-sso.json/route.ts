import { NextResponse } from 'next/server'
import { getJwks } from '@/lib/sso/keys'

// Rendered per request (keys come from env); CDN caching via Cache-Control.
export const dynamic = 'force-dynamic'

/** Public JWKS — SPEC §3. Suite apps verify PLTs offline against this. */
export async function GET() {
  const jwks = await getJwks()
  return NextResponse.json(jwks, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
