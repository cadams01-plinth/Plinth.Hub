/**
 * @plinth/auth — Plinth Launch Token (PLT) verification for suite apps.
 *
 * Contract (SPEC §3): JWS RS256, verified offline against the Hub's JWKS at
 * /.well-known/plinth-sso.json. Apps MUST check iss, aud (their own slug),
 * exp, and reject a jti they have already seen within the token lifetime
 * (10-minute replay cache). The PLT is authentication, not a data-access
 * token — discard it once your own session is established.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

export const PLT_VERSION = 1
export const DEFAULT_ISSUER = 'https://hub.plinthresource.com'
/** 10-minute token lifetime → replay cache horizon (ms). */
export const REPLAY_WINDOW_MS = 10 * 60 * 1000

export interface PltClaims extends JWTPayload {
  iss: string
  aud: string
  sub: string
  org: string
  org_name: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  entitlements: string[]
  ver: number
  jti: string
}

export interface ReplayStore {
  /** Return true if jti was already present; otherwise record it until expiresAt. */
  seen(jti: string, expiresAt: Date): Promise<boolean> | boolean
}

/** Default single-process replay cache. Use Redis-backed storage in multi-instance apps. */
export class InMemoryReplayStore implements ReplayStore {
  private entries = new Map<string, number>()

  seen(jti: string, expiresAt: Date): boolean {
    const now = Date.now()
    for (const [key, exp] of this.entries) {
      if (exp <= now) this.entries.delete(key)
    }
    if (this.entries.has(jti)) return true
    this.entries.set(jti, expiresAt.getTime())
    return false
  }
}

export class PltError extends Error {
  constructor(
    /** Machine-readable code from SPEC §9. */
    public code:
      | 'PLINTH_TOKEN_EXPIRED'
      | 'PLINTH_TOKEN_REPLAY'
      | 'PLINTH_FORBIDDEN'
      | 'PLINTH_VALIDATION',
    message: string,
  ) {
    super(message)
    this.name = 'PltError'
  }
}

export interface PltVerifierOptions {
  /** Your app slug — verified against `aud`. Required. */
  appSlug: string
  /** JWKS URL; defaults to the production Hub well-known endpoint. */
  jwksUrl?: string
  /** Expected issuer; defaults to the production Hub. */
  issuer?: string
  /** Replay store; defaults to in-memory (single process only). */
  replayStore?: ReplayStore
}

export class PltVerifier {
  private jwks: ReturnType<typeof createRemoteJWKSet>
  private issuer: string
  private appSlug: string
  private replayStore: ReplayStore

  constructor(options: PltVerifierOptions) {
    this.appSlug = options.appSlug
    this.issuer = options.issuer ?? DEFAULT_ISSUER
    this.replayStore = options.replayStore ?? new InMemoryReplayStore()
    this.jwks = createRemoteJWKSet(
      new URL(options.jwksUrl ?? `${this.issuer}/.well-known/plinth-sso.json`),
      // JWKS served with cache-control 1 h; jose honours cooldown itself.
    )
  }

  /**
   * Verify a PLT. Throws PltError on any failure; returns the claims on
   * success, at which point the app establishes its own session and
   * discards the token.
   */
  async verify(token: string): Promise<PltClaims> {
    let payload: JWTPayload
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.appSlug,
        algorithms: ['RS256'],
      })
      payload = result.payload
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'ERR_JWT_EXPIRED') {
        throw new PltError('PLINTH_TOKEN_EXPIRED', 'Launch token has expired')
      }
      throw new PltError('PLINTH_FORBIDDEN', `Launch token rejected: ${String(err)}`)
    }

    const claims = payload as PltClaims
    if (claims.ver !== PLT_VERSION) {
      throw new PltError('PLINTH_VALIDATION', `Unsupported PLT version ${claims.ver}`)
    }
    for (const field of ['sub', 'org', 'org_name', 'name', 'email', 'role', 'jti'] as const) {
      if (!claims[field]) {
        throw new PltError('PLINTH_VALIDATION', `PLT missing required claim: ${field}`)
      }
    }
    if (!Array.isArray(claims.entitlements)) {
      throw new PltError('PLINTH_VALIDATION', 'PLT missing entitlements claim')
    }

    const expiresAt = new Date((claims.exp ?? 0) * 1000 + REPLAY_WINDOW_MS)
    if (await this.replayStore.seen(claims.jti, expiresAt)) {
      throw new PltError('PLINTH_TOKEN_REPLAY', 'Launch token already used')
    }
    return claims
  }
}

export interface LicenceCheckResult {
  valid: boolean
  entitled: boolean
  role?: string
  seats_state?: string
  reason?: string
}

/**
 * Re-validate entitlement with the Hub (SPEC §3): call at most hourly and
 * before privileged actions. `token` is a still-valid PLT or check token.
 */
export async function checkLicence(
  appSlug: string,
  token: string,
  hubUrl: string = DEFAULT_ISSUER,
): Promise<LicenceCheckResult> {
  const res = await fetch(
    `${hubUrl}/api/licence/check?app=${encodeURIComponent(appSlug)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return (await res.json()) as LicenceCheckResult
}
