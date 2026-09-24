import { getDB } from './db'
import type { Playlist } from '@/lib/types'

export async function getPlaylists(): Promise<Playlist[]> {
  try {
    const db = await getDB()
    if (!db.objectStoreNames.contains('playlists')) return []
    const list = await db.getAll('playlists')
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch (e) {
    console.warn('[Playlists] Failed to get playlists:', e)
    return []
  }
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  try {
    const db = await getDB()
    if (!db.objectStoreNames.contains('playlists')) return null
    return (await db.get('playlists', id)) ?? null
  } catch {
    return null
  }
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  try {
    const db = await getDB()
    if (!db.objectStoreNames.contains('playlists')) return
    await db.put('playlists', playlist)
  } catch (e) {
    console.warn('[Playlists] Failed to save playlist:', e)
  }
}

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
  const playlist: Playlist = {
    id: 'pl_' + Math.random().toString(36).slice(2, 10),
    name,
    description,
    itemIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  try {
    const db = await getDB()
    if (db && db.objectStoreNames.contains('playlists')) {
      await db.put('playlists', playlist).catch(() => {})
    }
  } catch (e) {
    console.warn('[Playlists] Failed to create playlist:', e)
  }
  return playlist
}

export async function addToPlaylist(playlistId: string, itemId: string): Promise<void> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('playlists')) return
    const pl = await db.get('playlists', playlistId).catch(() => null)
    if (pl) {
      if (!pl.itemIds.includes(itemId)) {
        pl.itemIds.push(itemId)
        pl.updatedAt = new Date().toISOString()
        await db.put('playlists', pl).catch(() => {})
      }
    }
  } catch (e) {
    console.warn('[Playlists] Failed to add to playlist:', e)
  }
}

export async function removeFromPlaylist(playlistId: string, itemId: string): Promise<void> {
  try {
    const db = await getDB()
    if (!db || !db.objectStoreNames.contains('playlists')) return
    const pl = await db.get('playlists', playlistId).catch(() => null)
    if (pl) {
      pl.itemIds = pl.itemIds.filter((id: string) => id !== itemId)
      pl.updatedAt = new Date().toISOString()
      await db.put('playlists', pl).catch(() => {})
    }
  } catch (e) {
    console.warn('[Playlists] Failed to remove from playlist:', e)
  }
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const db = await getDB()
  await db.delete('playlists', playlistId)
}
