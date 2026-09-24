/**
 * videoCache.ts — Server-side only.
 *
 * Manages extraction of individual video files from ZIP archives to a local
 * disk cache. Never extracts the entire archive. Never stores video bytes
 * in IndexedDB or browser memory.
 *
 * Cache location: <project-root>/.cache/videos/<lectureId><ext>
 */

import fs from 'fs'
import path from 'path'
import { getVideoCacheDir } from '@/lib/storagePaths'
import { extractEntry } from '@/lib/course-scanner/zipScanner'
import { isEntryPathSafe, isOutputPathSafe } from '@/lib/course-scanner/pathValidator'
import { getExtension } from '@/lib/course-scanner/contentDetector'

const CACHE_DIR = getVideoCacheDir()

/** Ensure the cache directory exists */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

/** Get the cached file path for a given lectureId (checks for any supported extension) */
export function getCachedFilePath(lectureId: string): string | null {
  ensureCacheDir()
  const extensions = ['.mp4', '.webm', '.mov', '.avi', '.m4v', '.mkv']
  for (const ext of extensions) {
    const candidate = path.join(CACHE_DIR, `${lectureId}${ext}`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Check if a video is already cached */
export function isCached(lectureId: string): boolean {
  return getCachedFilePath(lectureId) !== null
}

/**
 * Extract a single video entry from a ZIP to the local cache.
 *
 * @param archivePath  - Absolute path to the ZIP file
 * @param entryPath    - Internal ZIP entry path (forward slashes)
 * @param lectureId    - Stable lecture ID (used as cache filename)
 * @returns            - Absolute path of the cached file
 */
export async function extractToCache(
  archivePath: string,
  entryPath: string,
  lectureId: string
): Promise<string> {
  ensureCacheDir()

  // Security: validate entry path before extraction
  if (!isEntryPathSafe(entryPath)) {
    throw new Error(`Unsafe ZIP entry path rejected: ${entryPath}`)
  }

  // Determine extension from entry filename
  const ext = getExtension(path.basename(entryPath)) || '.mp4'
  const destPath = path.join(CACHE_DIR, `${lectureId}${ext}`)

  // Security: validate output path stays within cache dir
  if (!isOutputPathSafe(destPath, CACHE_DIR)) {
    throw new Error(`Output path validation failed: ${destPath}`)
  }

  // Already cached — return immediately
  if (fs.existsSync(destPath)) {
    return destPath
  }

  // Validate the archive exists
  if (!fs.existsSync(archivePath)) {
    throw new Error(`ZIP archive not found: ${archivePath}`)
  }

  // Extract the single entry
  await extractEntry(archivePath, entryPath, destPath)

  return destPath
}

/**
 * Get metadata for all cached files.
 */
export function listCachedFiles(): { lectureId: string; path: string; sizeBytes: number; cachedAt: Date }[] {
  ensureCacheDir()
  const results: { lectureId: string; path: string; sizeBytes: number; cachedAt: Date }[] = []

  try {
    const files = fs.readdirSync(CACHE_DIR)
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file)
      const stat = fs.statSync(filePath)
      const lectureId = path.basename(file, path.extname(file))
      results.push({ lectureId, path: filePath, sizeBytes: stat.size, cachedAt: stat.birthtime })
    }
  } catch {
    // Ignore errors
  }

  return results
}

/**
 * Remove a specific lecture's cached file.
 */
export function evictFromCache(lectureId: string): boolean {
  const filePath = getCachedFilePath(lectureId)
  if (!filePath) return false
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Remove cached files older than maxAgeMs milliseconds.
 */
export function cleanStaleCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
  const files = listCachedFiles()
  const now = Date.now()
  for (const file of files) {
    if (now - file.cachedAt.getTime() > maxAgeMs) {
      try {
        fs.unlinkSync(file.path)
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export { CACHE_DIR }
