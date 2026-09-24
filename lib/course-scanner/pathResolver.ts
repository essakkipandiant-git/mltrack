/**
 * pathResolver.ts — Secure course path resolution.
 *
 * All server-side file access for course content must go through this module.
 * Prevents path traversal attacks and ensures all paths stay within COURSE_ROOT.
 */

import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'

function readCourseRootRaw(): string {
  try {
    const configPath = getStorageFilePath('mltrack-config.json')
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw) as { courseRoot?: string }
    return config.courseRoot?.trim() ?? ''
  } catch {
    return ''
  }
}

/** Read the configured course root directory. Returns empty string if not configured. */
export function getCourseRoot(): string {
  return readCourseRootRaw()
}

/**
 * Resolve a relative path (e.g. "Day-1.zip" or "Day-1/Lecture01.mp4")
 * against COURSE_ROOT, with full path traversal protection.
 *
 * Rules:
 *  - Rejects absolute paths from client
 *  - Rejects ".." traversal sequences
 *  - Rejects null bytes
 *  - Verifies the resolved path stays inside COURSE_ROOT
 *
 * @param relPath - Relative path within the course root (e.g. "Day-1.zip")
 * @returns Absolute path on disk
 * @throws Error if courseRoot not configured, or path is unsafe
 */
export function resolveCoursePath(relPath: string): string {
  const courseRoot = getCourseRoot()
  if (!courseRoot) {
    throw new Error('Course root is not configured. Go to Settings to set your course folder.')
  }

  // Reject null bytes
  if (relPath.includes('\0')) {
    throw new Error(`Path contains null byte: rejected`)
  }

  // Reject absolute paths
  if (path.isAbsolute(relPath)) {
    throw new Error(`Absolute paths are not accepted (security): ${relPath}`)
  }

  // Normalize separators (Windows backslash → forward slash)
  const normalized = relPath.replace(/\\/g, '/')

  // Reject traversal sequences BEFORE resolution
  if (normalized.includes('../') || normalized.startsWith('..')) {
    throw new Error(`Path traversal rejected: ${relPath}`)
  }

  // Resolve against courseRoot
  const resolved = path.resolve(courseRoot, normalized)
  const rootResolved = path.resolve(courseRoot)

  // Final check: resolved path must start with courseRoot
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Path escapes course root (security): ${relPath}`)
  }

  return resolved
}

/**
 * Validate that an absolute path (e.g. from a stored loose-file sourcePath)
 * is inside COURSE_ROOT. Used when the scanner stored an absolute path.
 *
 * @param absolutePath - Absolute filesystem path to validate
 * @returns The same path if valid
 * @throws Error if path is outside courseRoot
 */
export function validateAbsoluteCoursePath(absolutePath: string): string {
  const courseRoot = getCourseRoot()
  if (!courseRoot) {
    throw new Error('Course root is not configured.')
  }

  const rootResolved = path.resolve(courseRoot)
  const pathResolved = path.resolve(absolutePath)

  if (
    pathResolved !== rootResolved &&
    !pathResolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Path is outside course root (security): ${absolutePath}`)
  }

  return pathResolved
}
