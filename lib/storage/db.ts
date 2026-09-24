import { openDB, type IDBPDatabase } from 'idb'
import type {
  LectureProgress,
  WatchHistoryEntry,
  Note,
  ScanResult,
  ManualAssignment,
  TelegramMedia,
  Playlist,
  MediaPlaybackState,
} from '@/lib/types'

// ─── Schema ───────────────────────────────────────────────────────────────────

export interface MLTrackDBSchema {
  progress: {
    key: string
    value: LectureProgress
  }
  history: {
    key: string
    value: WatchHistoryEntry
    indexes: { by_watched: string }
  }
  notes: {
    key: string
    value: Note
    indexes: { by_lecture: string }
  }
  settings: {
    key: string
    value: { key: string; value: unknown }
  }
  courseCache: {
    key: string
    value: ScanResult & { _id: string }
  }
  manualAssignments: {
    key: string
    value: ManualAssignment
  }
  telegramMedia: {
    key: string
    value: TelegramMedia
    indexes: { by_chat: string; by_date: string }
  }
  favorites: {
    key: string
    value: { id: string; addedAt: string }
  }
  playlists: {
    key: string
    value: Playlist
  }
  mediaProgress: {
    key: string
    value: MediaPlaybackState
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const REQUIRED_STORES = [
  'progress',
  'history',
  'notes',
  'settings',
  'courseCache',
  'manualAssignments',
  'telegramMedia',
  'favorites',
  'playlists',
  'mediaProgress',
] as const

function setupStores(db: any) {
  if (!db.objectStoreNames.contains('progress')) {
    db.createObjectStore('progress', { keyPath: 'lectureId' })
  }

  if (!db.objectStoreNames.contains('history')) {
    const historyStore = db.createObjectStore('history', { keyPath: 'lectureId' })
    historyStore.createIndex('by_watched', 'watchedAt')
  }

  if (!db.objectStoreNames.contains('notes')) {
    const notesStore = db.createObjectStore('notes', { keyPath: 'id' })
    notesStore.createIndex('by_lecture', 'lectureId')
  }

  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' })
  }

  if (!db.objectStoreNames.contains('courseCache')) {
    db.createObjectStore('courseCache', { keyPath: '_id' })
  }

  if (!db.objectStoreNames.contains('manualAssignments')) {
    db.createObjectStore('manualAssignments', { keyPath: 'itemId' })
  }

  // Telegram & Advanced Media Library stores
  if (!db.objectStoreNames.contains('telegramMedia')) {
    const tgStore = db.createObjectStore('telegramMedia', { keyPath: 'id' })
    tgStore.createIndex('by_chat', 'chatId')
    tgStore.createIndex('by_date', 'date')
  }

  if (!db.objectStoreNames.contains('favorites')) {
    db.createObjectStore('favorites', { keyPath: 'id' })
  }

  if (!db.objectStoreNames.contains('playlists')) {
    db.createObjectStore('playlists', { keyPath: 'id' })
  }

  if (!db.objectStoreNames.contains('mediaProgress')) {
    db.createObjectStore('mediaProgress', { keyPath: 'id' })
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: IDBPDatabase<MLTrackDBSchema> | null = null
let _initPromise: Promise<IDBPDatabase<MLTrackDBSchema>> | null = null

export async function getDB(): Promise<IDBPDatabase<MLTrackDBSchema>> {
  if (_db) {
    const hasAll = REQUIRED_STORES.every(store => _db!.objectStoreNames.contains(store as any))
    if (hasAll) return _db

    // Stale database connection missing new stores — close and upgrade
    try {
      _db.close()
    } catch {
      // ignore
    }
    _db = null
  }

  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      let db = await openDB<MLTrackDBSchema>('mltrack-db', 4, {
        upgrade(database) {
          setupStores(database)
        },
        blocked() {
          console.warn('[IndexedDB] Upgrade waiting for other open tabs to close.')
        },
        blocking() {
          try {
            _db?.close()
          } catch {
            // ignore
          }
          _db = null
        },
      })

      // If database was already version 4 or higher from an earlier dev session without some stores
      const missingAny = REQUIRED_STORES.some(store => !db.objectStoreNames.contains(store as any))
      if (missingAny) {
        const nextVersion = db.version + 1
        db.close()
        db = await openDB<MLTrackDBSchema>('mltrack-db', nextVersion, {
          upgrade(database) {
            setupStores(database)
          },
          blocking() {
            try {
              _db?.close()
            } catch {
              // ignore
            }
            _db = null
          },
        })
      }

      _db = db
      return _db
    } finally {
      _initPromise = null
    }
  })()

  return _initPromise
}

