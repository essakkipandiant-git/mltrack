/**
 * serverCache.ts — Server-side course metadata cache.
 *
 * Stores the ScanResult in a local JSON file (mltrack-course-cache.json, gitignored).
 * The video prepare endpoint reads from this cache to resolve lecture→archive paths
 * WITHOUT trusting arbitrary paths from the browser.
 *
 * This is the single source of truth for lecture metadata on the server side.
 */

import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'
import type { ScanResult, CourseItem } from '@/lib/types'

const CACHE_PATH = getStorageFilePath('mltrack-course-cache.json')

/** Save the full ScanResult to disk after a scan or import */
export function saveServerCourseCache(result: ScanResult): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2), 'utf-8')
}

/** Load the server-side course cache. Returns null if not found or unreadable. */
export function loadServerCourseCache(): ScanResult | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8')
    return JSON.parse(raw) as ScanResult
  } catch {
    return null
  }
}

/** Clear the server-side cache file */
export function clearServerCourseCache(): void {
  try {
    fs.unlinkSync(CACHE_PATH)
  } catch {
    // Ignore if not found
  }
}

/**
 * Find a CourseItem by its stable ID, searching the full course structure.
 * This is the SECURE way for API routes to resolve lecture metadata —
 * never accept arbitrary archive paths from the browser.
 */
export function findLectureById(lectureId: string): CourseItem | null {
  const cache = loadServerCourseCache()
  if (!cache) return null

  // Search day lectures (direct) and sub-folder items
  for (const day of cache.days) {
    const allDayItems = [
      ...day.lectures,
      ...day.subFolders.flatMap(f => f.items),
      ...day.resources,
    ]
    const found = allDayItems.find(item => item.id === lectureId)
    if (found) return found
  }

  // Search mentoring sessions
  for (const session of cache.mentoring) {
    const found = session.items.find(item => item.id === lectureId)
    if (found) return found
  }

  return null
}

/** Check if the server cache file exists */
export function serverCacheExists(): boolean {
  return fs.existsSync(CACHE_PATH)
}
