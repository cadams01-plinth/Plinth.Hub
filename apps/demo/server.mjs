/**
 * Plinth demo suite app — the AT-04 SSO leg. Exercises the full PLT contract
 * (SPEC §3) using @plinth/auth exactly as a real suite app would:
 * fragment token → POST /session → offline JWKS verify (iss/aud/exp/jti) →
 * own session cookie → PLT discarded.
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { PltVerifier, PltError } from '@plinth/auth'

const PORT = Number(process.env.DEMO_APP_PORT ?? 4000)
const HUB_URL = process.env.DEMO_HUB_URL ?? 'http://localhost:3000'
const APP_SLUG = process.env.DEMO_APP_SLUG ?? 'plinth-demo'

const verifier = new PltVerifier({
  appSlug: APP_SLUG,
  issuer: HUB_URL,
  jwksUrl: process.env.DEMO_HUB_JWKS_URL ?? `${HUB_URL}/.well-known/plinth-sso.json`,
})

// The demo app's OWN sessions — in memory, cookie-keyed.
const sessions = new Map()

const LANDING = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>Plinth Demo App</title>
<style>body{font-family:system-ui;margin:3rem auto;max-width:38rem;padding:0 1rem}
.ok{border-left:4px solid #1a7f4e;padding:.6rem 1rem;background:#eefaf2}
.err{border-left:4px solid #b3261e;padding:.6rem 1rem;background:#fdeeee}</style></head>
<body><h1>Plinth Demo App</h1><div id="status">Checking launch token…</div>
<script>
  const frag = new URLSearchParams(location.hash.slice(1));
  const token = frag.get('token');
  history.replaceState(null, '', location.pathname); // scrub the fragment
  const el = document.getElementById('status');
  if (!token) {
    el.className = 'err';
    el.innerHTML = 'No launch token. <a href="${HUB_URL}/api/sso/launch?app=${APP_SLUG}">Launch from the Hub</a>.';
  } else {
    fetch('/session', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: token })
      .then(async (r) => {
        const body = await r.json();
        if (r.ok) {
          el.className = 'ok';
          el.innerHTML = 'Signed in as <strong>' + body.name + '</strong> (' + body.role +
            ') of <strong>' + body.org_name + '</strong>. PLT verified and discarded.';
        } else {
          el.className = 'err';
          el.innerHTML = 'Token rejected: <code>' + body.code + '</code> — ' + body.message +
            '. <a href="${HUB_URL}/api/sso/launch?app=${APP_SLUG}">Re-launch from the Hub</a>.';
        }
      });
  }
</script></body></html>`

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(LANDING)
    return
  }

  if (req.method === 'POST' && req.url === '/session') {
    let token = ''
    for await (const chunk of req) token += chunk
    try {
      const claims = await verifier.verify(token.trim())
      const sessionId = randomBytes(24).toString('hex')
      sessions.set(sessionId, {
        sub: claims.sub,
        org: claims.org,
        role: claims.role,
        expires: Date.now() + 8 * 3600 * 1000,
      })
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `demo_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`,
      })
      res.end(
        JSON.stringify({
          name: claims.name,
          role: claims.role,
          org_name: claims.org_name,
        }),
      )
    } catch (err) {
      const code = err instanceof PltError ? err.code : 'PLINTH_FORBIDDEN'
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ code, message: err.message }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ code: 'NOT_FOUND' }))
}).listen(PORT, () => {
  console.log(`Plinth demo app on http://localhost:${PORT} (slug: ${APP_SLUG})`)
})
