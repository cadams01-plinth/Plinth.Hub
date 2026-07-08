/**
 * SSO integration test — the AT-04 (demo leg) and AT-14 (replay/expiry)
 * acceptance tests, runnable WITHOUT Supabase. Boots the real demo app
 * (server.mjs) against a local JWKS, mints PLTs with a matching key, and
 * asserts the demo app's @plinth/auth verification: accept once, reject
 * replay, reject expired, reject wrong-audience.
 *
 * Run: node apps/demo/test/sso-integration.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { generateKeyPairSync, createPublicKey, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { SignJWT, exportJWK, importPKCS8 } from 'jose'

const HUB_URL = 'https://hub.plinthresource.com'
const APP_SLUG = 'plinth-demo'
let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) failures++
}

// 1. Test keypair + JWKS server
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const jwk = await exportJWK(createPublicKey(pem))
const jwks = { keys: [{ ...jwk, kid: 'test-kid', use: 'sig', alg: 'RS256' }] }
const jwksServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(jwks))
}).listen(0)
await once(jwksServer, 'listening')
const jwksUrl = `http://127.0.0.1:${jwksServer.address().port}/.well-known/plinth-sso.json`

// 2. Boot the real demo app
const demoPort = 4599
const demo = spawn(process.execPath, ['apps/demo/server.mjs'], {
  env: {
    ...process.env,
    DEMO_APP_PORT: String(demoPort),
    DEMO_APP_SLUG: APP_SLUG,
    DEMO_HUB_URL: HUB_URL,
    DEMO_HUB_JWKS_URL: jwksUrl,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise((resolve) => demo.stdout.on('data', (d) => String(d).includes('demo app on') && resolve()))

const signingKey = await importPKCS8(pem, 'RS256')
async function mint({ aud = APP_SLUG, exp = '600s', jti = randomUUID() } = {}) {
  return new SignJWT({
    org: 'org-1', org_name: 'Test Org', name: 'Test User',
    email: 'test@example.test', role: 'admin', entitlements: [aud], ver: 1,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuer(HUB_URL).setAudience(aud).setSubject('user-1')
    .setJti(jti).setIssuedAt().setExpirationTime(exp).sign(signingKey)
}
const post = async (token) => {
  const res = await fetch(`http://127.0.0.1:${demoPort}/session`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: token,
  })
  return { status: res.status, body: await res.json() }
}

try {
  // AT-04 demo leg: a valid PLT establishes a session.
  const token = await mint()
  const first = await post(token)
  check('AT-04 valid PLT accepted (200)', first.status === 200 && first.body.name === 'Test User')

  // AT-14: the same jti is rejected on second use.
  const replay = await post(token)
  check('AT-14 replay rejected (PLINTH_TOKEN_REPLAY)', replay.status === 401 && replay.body.code === 'PLINTH_TOKEN_REPLAY')

  // AT-14: an expired PLT is rejected.
  const expired = await post(await mint({ exp: '-10s' }))
  check('AT-14 expired PLT rejected (PLINTH_TOKEN_EXPIRED)', expired.status === 401 && expired.body.code === 'PLINTH_TOKEN_EXPIRED')

  // A wrong-audience PLT is rejected.
  const wrongAud = await post(await mint({ aud: 'some-other-app' }))
  check('wrong-audience PLT rejected (401)', wrongAud.status === 401)
} finally {
  demo.kill()
  jwksServer.close()
}

console.log(failures === 0 ? '\nSSO integration: all green' : `\nSSO integration: ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
