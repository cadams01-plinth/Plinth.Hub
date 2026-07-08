import { describe, it, expect } from 'vitest'
import { sniffMime, sanitiseFilename, storagePath, MIME_ALLOWLIST, MAX_FILE_BYTES } from './documents'

function bytes(...b: number[]): Uint8Array {
  return new Uint8Array(b)
}

describe('sniffMime (server-side content sniff)', () => {
  it('accepts a %PDF header declared as application/pdf', () => {
    expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'application/pdf')).toBeNull()
  })
  it('rejects content that does not match its declared type', () => {
    // PNG magic declared as PDF
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47), 'application/pdf')).toMatch(/does not match/)
  })
  it('blocks a Windows executable regardless of declared type', () => {
    expect(sniffMime(bytes(0x4d, 0x5a, 0x90, 0x00), 'application/pdf')).toMatch(/executable/)
  })
  it('blocks an ELF binary', () => {
    expect(sniffMime(bytes(0x7f, 0x45, 0x4c, 0x46), 'application/zip')).toMatch(/ELF/)
  })
  it('allows a type with no known signature (e.g. docx/zip container) if not blocked', () => {
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04), 'application/zip')).toBeNull()
    // A declared Office doc whose bytes we do not fingerprint passes the sniff.
    expect(sniffMime(bytes(0x00, 0x01, 0x02, 0x03), 'application/msword')).toBeNull()
  })
  it('accepts JPEG and PNG by signature', () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBeNull()
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47), 'image/png')).toBeNull()
  })
})

describe('sanitiseFilename', () => {
  it('strips path separators (traversal defence)', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitiseFilename('a/b/c\\d\\evil.pdf')).toBe('evil.pdf')
  })
  it('replaces unsafe characters and preserves a readable name', () => {
    expect(sanitiseFilename('GA Drawing (rev B).pdf')).toBe('GA Drawing (rev B).pdf')
    expect(sanitiseFilename('weird*name?<>.pdf')).toBe('weird_name_.pdf')
  })
  it('never returns empty', () => {
    expect(sanitiseFilename('')).toBe('file')
    expect(sanitiseFilename('/')).toBe('file')
  })
  it('caps length', () => {
    expect(sanitiseFilename('x'.repeat(500)).length).toBeLessThanOrEqual(140)
  })
})

describe('storagePath (load-bearing convention, SPEC §2)', () => {
  it('builds org_/project_/doc_/vN/ prefix and sanitises the filename', () => {
    const p = storagePath('ORG', 'PROJ', 'DOC', 3, '../x y.pdf')
    expect(p).toBe('org_ORG/project_PROJ/doc_DOC/v3/x y.pdf')
  })
})

describe('MIME allowlist + size cap', () => {
  it('includes the core construction formats and excludes executables', () => {
    expect(MIME_ALLOWLIST.has('application/pdf')).toBe(true)
    expect(MIME_ALLOWLIST.has('image/vnd.dwg')).toBe(true)
    expect(MIME_ALLOWLIST.has('application/x-msdownload')).toBe(false)
  })
  it('caps at 500 MB (matches the DB check)', () => {
    expect(MAX_FILE_BYTES).toBe(524_288_000)
  })
})
