import { SignJWT, importPKCS8 } from 'jose'
import { randomUUID } from 'node:crypto'

/**
 * Mint PLTs directly for SSO tests (AT-14 replay, licence-check edges) using
 * the same private key the Hub signs with — PLINTH_SSO_PRIVATE_KEY_B64.
 */
export async function mintTestPlt(opts: {
  appSlug: string
  userId: string
  org: string
  role?: string
  entitlements?: string[]
  hubUrl?: string
  expiresInSeconds?: number
  jti?: string
}): Promise<string> {
  const b64 = process.env.PLINTH_SSO_PRIVATE_KEY_B64
  if (!b64) throw new Error('AT-14 needs PLINTH_SSO_PRIVATE_KEY_B64')
  const pem = Buffer.from(b64, 'base64').toString('utf8')
  const key = await importPKCS8(pem, 'RS256')
  const hubUrl = opts.hubUrl ?? process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3000'

  return new SignJWT({
    org: opts.org,
    org_name: 'Test Org',
    name: 'Test User',
    email: 'test@example.test',
    role: opts.role ?? 'admin',
    entitlements: opts.entitlements ?? [opts.appSlug],
    ver: 1,
  })
    .setProtectedHeader({ alg: 'RS256', kid: process.env.PLINTH_SSO_KID ?? 'plinth-sso-dev' })
    .setIssuer(hubUrl)
    .setAudience(opts.appSlug)
    .setSubject(opts.userId)
    .setJti(opts.jti ?? randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${opts.expiresInSeconds ?? 600}s`)
    .sign(key)
}
