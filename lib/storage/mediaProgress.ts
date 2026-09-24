import { getDB } from './db'
import type { MediaPlaybackState } from '@/lib/types'

export async function getMediaProgress(id: string): Promise<MediaPlaybackState | null> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('mediaProgress')) return null
    return (await db.get('mediaProgress', id).catch(() => null)) ?? null
  } catch {
    return null
  }
}

export async function saveMediaProgress(
  id: string,
  data: Partial<Omit<MediaPlaybackState, 'id'>> & { title?: string }
): Promise<void> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('mediaProgress')) return
    const existing = await db.get('mediaProgress', id).catch(() => null)
    const updated: MediaPlaybackState = {
      id,
      title: data.title || existing?.title || 'Media',
      currentPosition: 0,
      duration: 0,
      percentage: 0,
      completed: false,
      lastWatched: new Date().toISOString(),
      ...existing,
      ...data,
    }
    await db.put('mediaProgress', updated).catch(() => {})
  } catch (e) {
    console.warn('[MediaProgress] Failed to save media progress:', e)
  }
}

export async function markMediaComplete(id: string): Promise<void> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('mediaProgress')) return
    const existing = await db.get('mediaProgress', id).catch(() => null)
    if (existing) {
      existing.completed = true
      existing.percentage = 100
      existing.currentPosition = existing.duration
      existing.lastWatched = new Date().toISOString()
      await db.put('mediaProgress', existing).catch(() => {})
    }
  } catch (e) {
    console.warn('[MediaProgress] Failed to mark complete:', e)
  }
}

export async function getAllMediaProgress(): Promise<MediaPlaybackState[]> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('mediaProgress')) return []
    const all = await db.getAll('mediaProgress').catch(() => [])
    return all || []
  } catch {
    return []
  }
}
