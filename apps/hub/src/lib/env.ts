/** Central env access. Server-only vars throw if read in the browser bundle. */

export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    hubUrl: process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3000',
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}`)
  return value
}

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() called in the browser')
  }
  return {
    ...publicEnv(),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    ssoPrivateKeyB64: required('PLINTH_SSO_PRIVATE_KEY_B64'),
    ssoKid: process.env.PLINTH_SSO_KID ?? 'plinth-sso-dev',
    ssoPreviousJwk: process.env.PLINTH_SSO_PREVIOUS_JWK ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
  }
}
