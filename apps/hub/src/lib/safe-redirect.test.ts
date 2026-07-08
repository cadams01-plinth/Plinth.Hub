import { describe, it, expect } from 'vitest'
import { safeNext } from './safe-redirect'

const BASE = 'https://hub.plinthresource.com/auth/callback'

describe('safeNext (open-redirect guard)', () => {
  it('allows same-origin relative paths', () => {
    expect(safeNext('/launcher', BASE)).toBe('/launcher')
    expect(safeNext('/projects?x=1', BASE)).toBe('/projects?x=1')
    expect(safeNext('/documents/abc', BASE)).toBe('/documents/abc')
  })

  it('blocks the backslash bypass (WHATWG normalises \\ → /)', () => {
    expect(safeNext('/\\evil.com', BASE)).toBe('/launcher')
    expect(safeNext('/\\/\\evil.com', BASE)).toBe('/launcher')
  })

  it('blocks protocol-relative and absolute off-origin targets', () => {
    expect(safeNext('//evil.com', BASE)).toBe('/launcher')
    expect(safeNext('https://evil.com', BASE)).toBe('/launcher')
    expect(safeNext('http://evil.com/x', BASE)).toBe('/launcher')
  })

  it('falls back on empty / null / unparseable input', () => {
    expect(safeNext('', BASE)).toBe('/launcher')
    expect(safeNext(null, BASE)).toBe('/launcher')
    expect(safeNext(undefined, BASE)).toBe('/launcher')
  })

  it('strips the origin even when an absolute same-origin URL is given', () => {
    expect(safeNext('https://hub.plinthresource.com/people', BASE)).toBe('/people')
  })
})
