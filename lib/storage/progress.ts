import { getDB } from './db'
import type { LectureProgress } from '@/lib/types'

export async function getLectureProgress(lectureId: string): Promise<LectureProgress | null> {
  const db = await getDB()
  return (await db.get('progress', lectureId)) ?? null
}

export async function saveLectureProgress(
  lectureId: string,
  data: Partial<Omit<LectureProgress, 'lectureId'>>
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('progress', lectureId)
  const updated: LectureProgress = {
    lectureId,
    currentPosition: 0,
    duration: 0,
    percentage: 0,
    completed: false,
    lastWatched: new Date().toISOString(),
    ...existing,
    ...data,
  }
  await db.put('progress', updated)
}

export async function markLectureComplete(lectureId: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('progress', lectureId)
  const updated: LectureProgress = {
    ...existing,
    lectureId,
    currentPosition: existing?.duration ?? 0,
    duration: existing?.duration ?? 0,
    percentage: 100,
    completed: true,
    lastWatched: new Date().toISOString(),
  }
  await db.put('progress', updated)
}

export async function getAllProgress(): Promise<LectureProgress[]> {
  const db = await getDB()
  return db.getAll('progress')
}

export async function clearAllProgress(): Promise<void> {
  const db = await getDB()
  await db.clear('progress')
}
