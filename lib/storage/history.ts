import { getDB } from './db'
import type { WatchHistoryEntry } from '@/lib/types'

export async function getWatchHistory(): Promise<WatchHistoryEntry[]> {
  const db = await getDB()
  // Get all, sort newest first by watchedAt
  const all = await db.getAll('history')
  return all.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
}

export async function addToHistory(entry: WatchHistoryEntry): Promise<void> {
  const db = await getDB()
  await db.put('history', entry)
}

export async function clearHistory(): Promise<void> {
  const db = await getDB()
  await db.clear('history')
}

export async function getRecentHistory(limit = 10): Promise<WatchHistoryEntry[]> {
  const all = await getWatchHistory()
  return all.slice(0, limit)
}
