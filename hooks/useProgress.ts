'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getLectureProgress,
  saveLectureProgress,
  markLectureComplete,
  getAllProgress,
} from '@/lib/storage/progress'
import { addToHistory } from '@/lib/storage/history'
import type { LectureProgress, CourseItem } from '@/lib/types'

const THROTTLE_MS = 5000  // write progress every 5 seconds max

export interface UseProgressReturn {
  progress: LectureProgress | null
  allProgress: LectureProgress[]
  save: (position: number, duration: number) => void
  saveImmediate: (position: number, duration: number) => void
  complete: () => void
  reload: () => void
}

export function useProgress(lecture: CourseItem | null): UseProgressReturn {
  const [progress, setProgress] = useState<LectureProgress | null>(null)
  const [allProgress, setAllProgress] = useState<LectureProgress[]>([])
  const lastWriteRef = useRef<number>(0)
  const pendingRef = useRef<{ position: number; duration: number } | null>(null)
  const [rev, setRev] = useState(0)

  const reload = useCallback(() => setRev(r => r + 1), [])

  // Load progress for current lecture
  useEffect(() => {
    if (!lecture) { setProgress(null); return }
    getLectureProgress(lecture.id).then(p => setProgress(p))
  }, [lecture?.id, rev])

  // Load all progress for dashboard stats
  useEffect(() => {
    getAllProgress().then(setAllProgress)
  }, [rev])

  const saveImmediate = useCallback(async (position: number, duration: number) => {
    if (!lecture) return
    const percentage = duration > 0 ? Math.round((position / duration) * 100) : 0
    const data: Partial<LectureProgress> = { currentPosition: position, duration, percentage, lastWatched: new Date().toISOString() }
    await saveLectureProgress(lecture.id, data)
    setProgress(prev => prev ? { ...prev, ...data } : { lectureId: lecture.id, completed: false, ...data } as LectureProgress)

    // Update history
    await addToHistory({
      lectureId: lecture.id,
      title: lecture.title,
      dayLabel: lecture.folderPath[0] ?? '',
      lastPosition: position,
      percentage,
      watchedAt: new Date().toISOString(),
    })

    lastWriteRef.current = Date.now()
  }, [lecture])

  // Throttled save — writes at most every THROTTLE_MS
  const save = useCallback((position: number, duration: number) => {
    pendingRef.current = { position, duration }
    const now = Date.now()
    if (now - lastWriteRef.current >= THROTTLE_MS) {
      saveImmediate(position, duration)
    }
  }, [saveImmediate])

  // Flush pending on unmount
  useEffect(() => {
    return () => {
      if (pendingRef.current && lecture) {
        saveImmediate(pendingRef.current.position, pendingRef.current.duration)
      }
    }
  }, [lecture, saveImmediate])

  const complete = useCallback(async () => {
    if (!lecture) return
    await markLectureComplete(lecture.id)
    setProgress(prev => prev ? { ...prev, completed: true, percentage: 100 } : null)
    reload()
  }, [lecture, reload])

  return { progress, allProgress, save, saveImmediate, complete, reload }
}
