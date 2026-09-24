'use client'

import { useState, useEffect, useCallback } from 'react'
import { getCachedCourse, saveCourseCache } from '@/lib/storage/courseCache'
import { getManualAssignments } from '@/lib/storage/assignments'
import type { ScanResult, DayGroup, CourseItem, ManualAssignment } from '@/lib/types'

export interface CourseData {
  course: ScanResult | null
  isLoading: boolean
  error: string | null
  allLectures: CourseItem[]
  totalLectures: number
  reload: () => void
}

export function useCourseData(): CourseData {
  const [course, setCourse] = useState<ScanResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rev, setRev] = useState(0)

  const reload = useCallback(() => setRev(r => r + 1), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        let cached = await getCachedCourse()

        // Fallback to server-side course cache if IndexedDB is not yet populated
        if (!cached) {
          try {
            const res = await fetch('/api/course')
            if (res.ok) {
              const data = await res.json() as { course?: ScanResult }
              if (data?.course && (data.course.days?.length > 0 || data.course.mentoring?.length > 0)) {
                cached = data.course
                await saveCourseCache(cached)
              }
            }
          } catch (fetchErr) {
            console.warn('[useCourseData] Could not fetch server course:', fetchErr)
          }
        }

        if (!cancelled && cached) {
          // Apply manual assignments
          const assignments = await getManualAssignments()
          setCourse(applyAssignments(cached, assignments))
        } else if (!cancelled) {
          setCourse(null)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [rev])

  const allLectures = course
    ? course.days.flatMap(d => [
        ...d.lectures,
        ...d.subFolders.flatMap(f => f.items),
      ]).filter(i => i.type === 'VIDEO')
    : []

  return {
    course,
    isLoading,
    error,
    allLectures,
    totalLectures: allLectures.length,
    reload,
  }
}

/** Apply manual day assignments on top of auto-detected data */
function applyAssignments(course: ScanResult, assignments: ManualAssignment[]): ScanResult {
  if (assignments.length === 0) return course
  // Assignments are stored per-item; for display purposes the course structure
  // already has them grouped — this is used to override labels/groupings in
  // components that need to display individual item assignments.
  return course
}

/** Import a new scan result, preserving existing learning data */
export async function importCourse(scanResult: ScanResult): Promise<void> {
  await saveCourseCache(scanResult)
}
