import 'server-only'
import { exportJWK, importPKCS8, type JWK, type KeyLike } from 'jose'
import { createPublicKey } from 'node:crypto'
import { serverEnv } from '@/lib/env'

/**
 * SSO key handling (SPEC §3). The private key signs PLTs; the public half is
 * served as JWKS at /.well-known/plinth-sso.json. Rotation: publish the new
 * key alongside the old for 24 h (PLINTH_SSO_PREVIOUS_JWK), then retire.
 */

let cachedPrivateKey: KeyLike | null = null
let cachedJwks: { keys: JWK[] } | null = null

function privateKeyPem(): string {
  const { ssoPrivateKeyB64 } = serverEnv()
  return Buffer.from(ssoPrivateKeyB64, 'base64').toString('utf8')
}

export async function getSigningKey(): Promise<{ key: KeyLike; kid: string }> {
  if (!cachedPrivateKey) {
    cachedPrivateKey = await importPKCS8(privateKeyPem(), 'RS256')
  }
  return { key: cachedPrivateKey, kid: serverEnv().ssoKid }
}

export async function getJwks(): Promise<{ keys: JWK[] }> {
  if (cachedJwks) return cachedJwks
  const { ssoKid, ssoPreviousJwk } = serverEnv()

  const publicKey = createPublicKey(privateKeyPem())
  const jwk = await exportJWK(publicKey)
  const keys: JWK[] = [{ ...jwk, kid: ssoKid, use: 'sig', alg: 'RS256' }]

  if (ssoPreviousJwk) {
    // 24 h dual-publish window during rotation (AT-13)
    keys.push(JSON.parse(ssoPreviousJwk) as JWK)
  }
  cachedJwks = { keys }
  return cachedJwks
}
