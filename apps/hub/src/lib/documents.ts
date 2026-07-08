import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = 'project-documents'
export const MAX_FILE_BYTES = 524_288_000 // 500 MB — matches the DB check

/**
 * MIME allowlist for uploads (SPEC §4 upload pipeline). Construction-team
 * formats: PDFs, images, Office, CAD interchange, archives, plain data.
 */
export const MIME_ALLOWLIST = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'image/vnd.dwg',
  'image/vnd.dxf',
])

/** Executable/library signatures we refuse regardless of declared type. */
const BLOCKED_MAGIC: [string, number[]][] = [
  ['windows executable', [0x4d, 0x5a]], // MZ
  ['ELF binary', [0x7f, 0x45, 0x4c, 0x46]],
  ['Mach-O binary', [0xcf, 0xfa, 0xed, 0xfe]],
  ['Java class', [0xca, 0xfe, 0xba, 0xbe]],
]

const EXPECTED_MAGIC: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'application/zip': [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]],
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((b, i) => bytes[i] === b)
}

/**
 * Server-side content sniff (SPEC §4 finalise). Returns an error string or
 * null. Blocks executables outright; where a type has a well-known
 * signature, the bytes must match the declared type.
 */
export function sniffMime(bytes: Uint8Array, declared: string): string | null {
  for (const [label, magic] of BLOCKED_MAGIC) {
    if (startsWith(bytes, magic)) return `File content looks like a ${label}`
  }
  const expected = EXPECTED_MAGIC[declared]
  if (expected && !expected.some((m) => startsWith(bytes, m))) {
    return 'File content does not match its declared type'
  }
  return null
}

export function sanitiseFilename(name: string): string {
  const base = name.split('/').pop()!.split('\\').pop()!
  return (
    base
      .replace(/[^\w.\- ()]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140) || 'file'
  )
}

/** Path convention is load-bearing (SPEC §2). */
export function storagePath(
  orgId: string,
  projectId: string,
  documentId: string,
  version: number,
  filename: string,
): string {
  return `org_${orgId}/project_${projectId}/doc_${documentId}/v${version}/${sanitiseFilename(filename)}`
}

/**
 * Write access to a project for the current user (their RLS client):
 * org owner/admin, or project member who is not a viewer.
 */
export async function projectWriteAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  orgRole: string,
): Promise<boolean> {
  if (['owner', 'admin'].includes(orgRole)) {
    // Must still be the project's own org — RLS select confirms visibility.
    const { data } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
    return Boolean(data)
  }
  const { data: pm } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(pm && pm.role !== 'viewer')
}
