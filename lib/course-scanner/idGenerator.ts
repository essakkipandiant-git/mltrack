import { createHash } from 'crypto'
import path from 'path'

/**
 * Generate a stable, deterministic ID for a course item.
 *
 * For ZIP entries:   sha1(normalizedArchivePath + ':' + normalizedEntryPath)
 * For loose files:   sha1(':' + normalizedFilePath)
 *
 * IDs are purely based on source location — array indexes, scan order,
 * and extraction temp paths are NEVER used.
 */
export function generateId(archivePath: string, internalPath: string): string {
  const normalizedArchive = normalizePath(archivePath)
  const normalizedInternal = normalizePath(internalPath)
  const key = `${normalizedArchive}:${normalizedInternal}`
  return createHash('sha1').update(key).digest('hex')
}

/** Generate ID for a loose file (not in a ZIP) */
export function generateLooseFileId(absoluteFilePath: string): string {
  return generateId('', absoluteFilePath)
}

function normalizePath(p: string): string {
  // Normalize separators and case consistently
  return path.normalize(p).replace(/\\/g, '/').toLowerCase()
}
