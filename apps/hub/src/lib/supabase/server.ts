import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/** Request-scoped Supabase client carrying the signed-in user's identity —
 *  all queries run under RLS. This is the default client for the app. */
export function createClient() {
  const cookieStore = cookies()
  const { supabaseUrl, supabaseAnonKey } = publicEnv()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component — middleware refreshes sessions.
        }
      },
    },
  })
}
