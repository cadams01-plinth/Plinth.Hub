/**
 * Open-redirect-safe resolution of a post-auth `next` param.
 *
 * A prefix check like `startsWith('/') && !startsWith('//')` is bypassable:
 * the WHATWG URL parser normalises backslashes to slashes for special
 * schemes, so `/\evil.com` resolves to `https://evil.com/`. Resolve against
 * the request origin and only accept same-origin targets, returning the
 * path+query (never an absolute URL). Anything off-origin or unparyable falls
 * back to `/launcher`.
 */
export function safeNext(next: string | null | undefined, base: string): string {
  if (!next) return '/launcher'
  try {
    const resolved = new URL(next, base)
    if (resolved.origin === new URL(base).origin) {
      return resolved.pathname + resolved.search
    }
  } catch {
    // unparseable → fall through
  }
  return '/launcher'
}
