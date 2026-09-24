import path from 'path'

/**
 * Prevent ZIP path traversal attacks when extracting entries.
 *
 * A malicious ZIP might contain entries like:
 *   ../../etc/passwd
 *   ../../../Windows/System32/evil.exe
 *
 * This validator ensures all extracted paths stay within the intended cache directory.
 */

/**
 * Validate a ZIP entry path before extraction.
 * Returns true if safe, false if potentially malicious.
 */
export function isEntryPathSafe(entryPath: string): boolean {
  // Reject null bytes
  if (entryPath.includes('\0')) return false

  // Reject absolute paths
  if (path.isAbsolute(entryPath)) return false
  if (entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath)) return false

  // Reject path traversal sequences
  const normalized = path.normalize(entryPath)
  if (normalized.startsWith('..')) return false
  if (normalized.includes('..\\') || normalized.includes('../')) return false

  return true
}

/**
 * Validate that a resolved output path stays inside the intended root directory.
 * Call this after constructing the full output path.
 */
export function isOutputPathSafe(outputPath: string, rootDir: string): boolean {
  const resolvedOutput = path.resolve(outputPath)
  const resolvedRoot = path.resolve(rootDir)
  return resolvedOutput.startsWith(resolvedRoot + path.sep) || resolvedOutput === resolvedRoot
}

/**
 * Sanitize an entry path for use as a filename component.
 * Strips directory traversal, normalizes separators.
 */
export function sanitizeEntryPath(entryPath: string): string {
  return entryPath
    .replace(/\\/g, '/')       // normalize to forward slashes
    .replace(/^\/+/, '')       // no leading slashes
    .replace(/\.\.\//g, '')    // remove traversal sequences
    .replace(/\0/g, '')        // remove null bytes
}
