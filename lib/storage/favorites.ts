import { getDB } from './db'

export async function getFavorites(): Promise<string[]> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('favorites')) return []
    const all = await db.getAll('favorites').catch(() => [])
    return (all || []).map(f => f.id)
  } catch (e) {
    console.warn('[Favorites] Failed to get favorites:', e)
    return []
  }
}

export async function isFavorite(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('favorites')) return false
    const record = await db.get('favorites', id).catch(() => null)
    return !!record
  } catch (e) {
    console.warn('[Favorites] Failed to check favorite:', e)
    return false
  }
}

export async function toggleFavorite(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('favorites')) return false
    const existing = await db.get('favorites', id).catch(() => null)
    if (existing) {
      await db.delete('favorites', id).catch(() => {})
      return false
    } else {
      await db.put('favorites', { id, addedAt: new Date().toISOString() }).catch(() => {})
      return true
    }
  } catch (e) {
    console.warn('[Favorites] Failed to toggle favorite:', e)
    return false
  }
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('favorites')) return
    if (favorite) {
      await db.put('favorites', { id, addedAt: new Date().toISOString() }).catch(() => {})
    } else {
      await db.delete('favorites', id).catch(() => {})
    }
  } catch (e) {
    console.warn('[Favorites] Failed to set favorite:', e)
  }
}
