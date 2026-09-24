import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'
import type { TelegramChat, TelegramMedia } from '@/lib/types'

const INDEX_FILE = getStorageFilePath('mltrack-telegram-index.json')

export interface TelegramIndexData {
  lastIndexedAt: string | null
  chats: TelegramChat[]
  media: TelegramMedia[]
  lastMessageIdByChat: Record<string, number>
}

let _cachedIndex: TelegramIndexData | null = null
let _lastMtime = 0

export function readTelegramIndex(): TelegramIndexData {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const stat = fs.statSync(INDEX_FILE)
      if (_cachedIndex && _lastMtime === stat.mtimeMs) {
        return _cachedIndex
      }
      const raw = fs.readFileSync(INDEX_FILE, 'utf8')
      const data = JSON.parse(raw) as TelegramIndexData
      _cachedIndex = data
      _lastMtime = stat.mtimeMs
      return data
    }
  } catch (e) {
    console.error('[Telegram Store] Error reading index:', e)
  }

  const empty: TelegramIndexData = {
    lastIndexedAt: null,
    chats: [],
    media: [],
    lastMessageIdByChat: {},
  }
  _cachedIndex = empty
  return empty
}

export function saveTelegramIndex(data: TelegramIndexData): void {
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2), 'utf8')
    _cachedIndex = data
  } catch (e) {
    console.error('[Telegram Store] Error saving index:', e)
  }
}

export function getTelegramMediaById(id: string): TelegramMedia | null {
  const data = readTelegramIndex()
  return data.media.find(m => m.id === id) ?? null
}

export function updateTelegramMediaItem(id: string, update: Partial<TelegramMedia>): TelegramMedia | null {
  const data = readTelegramIndex()
  const idx = data.media.findIndex(m => m.id === id)
  if (idx === -1) return null

  data.media[idx] = { ...data.media[idx], ...update }
  saveTelegramIndex(data)
  return data.media[idx]
}

export interface QueryMediaOptions {
  q?: string
  filter?: 'all' | 'videos' | 'mkv' | 'mp4' | 'audio' | 'documents' | 'favorites'
  chatId?: string
  sort?: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest'
  page?: number
  limit?: number
  favorites?: string[]
}

export interface QueryMediaResult {
  items: TelegramMedia[]
  total: number
  page: number
  totalPages: number
  stats: {
    totalMedia: number
    totalVideos: number
    totalMkv: number
    totalMp4: number
  }
}

export function queryTelegramMedia(options: QueryMediaOptions = {}): QueryMediaResult {
  const data = readTelegramIndex()
  let items = [...data.media]

  const totalMedia = items.length
  const totalVideos = items.filter(i => i.mediaType === 'VIDEO').length
  const totalMkv = items.filter(i => i.container.toLowerCase() === 'mkv').length
  const totalMp4 = items.filter(i => i.container.toLowerCase() === 'mp4').length

  // Filter by chat
  if (options.chatId && options.chatId !== 'all') {
    items = items.filter(i => i.chatId === options.chatId)
  }

  // Filter by media type / format / favorites
  if (options.filter && options.filter !== 'all') {
    switch (options.filter) {
      case 'videos':
        items = items.filter(i => i.mediaType === 'VIDEO')
        break
      case 'mkv':
        items = items.filter(i => i.container.toLowerCase() === 'mkv')
        break
      case 'mp4':
        items = items.filter(i => i.container.toLowerCase() === 'mp4')
        break
      case 'audio':
        items = items.filter(i => i.mediaType === 'AUDIO')
        break
      case 'documents':
        items = items.filter(i => i.mediaType === 'DOCUMENT')
        break
      case 'favorites':
        const favSet = new Set(options.favorites || [])
        items = items.filter(i => favSet.has(i.id))
        break
    }
  }

  // Partial match search (case-insensitive across filename, chatTitle, container)
  if (options.q && options.q.trim()) {
    const term = options.q.trim().toLowerCase()
    items = items.filter(i =>
      i.filename.toLowerCase().includes(term) ||
      i.chatTitle.toLowerCase().includes(term) ||
      i.container.toLowerCase().includes(term)
    )
  }

  // Sorting
  const sort = options.sort || 'newest'
  items.sort((a, b) => {
    switch (sort) {
      case 'newest':
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      case 'oldest':
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'name-asc':
        return a.filename.localeCompare(b.filename)
      case 'name-desc':
        return b.filename.localeCompare(a.filename)
      case 'largest':
        return b.fileSize - a.fileSize
      case 'smallest':
        return a.fileSize - b.fileSize
      default:
        return 0
    }
  })

  // Pagination
  const page = Math.max(1, options.page || 1)
  const limit = Math.max(1, Math.min(100, options.limit || 24))
  const total = items.length
  const totalPages = Math.ceil(total / limit) || 1
  const paginated = items.slice((page - 1) * limit, page * limit)

  return {
    items: paginated,
    total,
    page,
    totalPages,
    stats: {
      totalMedia,
      totalVideos,
      totalMkv,
      totalMp4,
    },
  }
}
