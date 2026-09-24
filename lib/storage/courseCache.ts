import { getDB } from './db'
import type { ScanResult } from '@/lib/types'

const CACHE_KEY = 'course'

export async function getCachedCourse(): Promise<ScanResult | null> {
  const db = await getDB()
  const record = await db.get('courseCache', CACHE_KEY)
  if (!record) return null
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = record
  return rest as ScanResult
}

export async function saveCourseCache(data: ScanResult): Promise<void> {
  const db = await getDB()
  await db.put('courseCache', { ...data, _id: CACHE_KEY })
}

export async function clearCourseCache(): Promise<void> {
  const db = await getDB()
  await db.delete('courseCache', CACHE_KEY)
}
