import 'server-only'
import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { createLocalJWKSet } from 'jose'
import { publicEnv } from '@/lib/env'
import { getJwks, getSigningKey } from './keys'

export const PLT_TTL_SECONDS = 600 // 10 minutes — SPEC §3
export const PLT_VERSION = 1

export interface PltInput {
  userId: string
  organisationId: string
  organisationName: string
  fullName: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  appSlug: string
  entitlements: string[]
}

/** Mint a Plinth Launch Token (SPEC §3 claims, all required). */
export async function mintPlt(input: PltInput): Promise<string> {
  const { key, kid } = await getSigningKey()
  const { hubUrl } = publicEnv()

  return new SignJWT({
    org: input.organisationId,
    org_name: input.organisationName,
    name: input.fullName,
    email: input.email,
    role: input.role,
    entitlements: input.entitlements,
    ver: PLT_VERSION,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(hubUrl)
    .setAudience(input.appSlug)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${PLT_TTL_SECONDS}s`)
    .sign(key)
}

/** Verify a PLT locally (used by /api/licence/check). Returns claims or null. */
export async function verifyPltLocal(
  token: string,
  audience?: string,
): Promise<JWTPayload | null> {
  try {
    const jwks = createLocalJWKSet(await getJwks())
    const { payload } = await jwtVerify(token, jwks, {
      issuer: publicEnv().hubUrl,
      audience,
      algorithms: ['RS256'],
    })
    return payload
  } catch {
    return null
  }
}
