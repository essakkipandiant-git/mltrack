import { getTelegramClient } from './telegramClient'
import { readTelegramIndex, saveTelegramIndex, type TelegramIndexData } from './telegramStore'
import type { TelegramChat, TelegramMedia, TelegramScanStatus } from '@/lib/types'
import { Api } from 'telegram/tl'

let _scanStatus: TelegramScanStatus = {
  status: 'idle',
  indexedCount: 0,
}

export function getScanStatus(): TelegramScanStatus {
  const index = readTelegramIndex()
  return {
    ..._scanStatus,
    lastIndexedAt: index.lastIndexedAt ?? undefined,
  }
}

const SUPPORTED_EXTENSIONS = new Set([
  'mkv', 'mp4', 'webm', 'mov', 'avi', 'm4v', 'ts', 'flv', 'wmv',
  'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg',
  'pdf', 'zip'
])

function extractContainer(filename: string): string {
  const parts = filename.split('.')
  if (parts.length > 1) {
    return parts.pop()!.toLowerCase()
  }
  return 'unknown'
}

function determineMediaType(ext: string, mime: string): 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
  if (['mkv', 'mp4', 'webm', 'mov', 'avi', 'm4v', 'ts', 'flv', 'wmv'].includes(ext) || mime.startsWith('video/')) {
    return 'VIDEO'
  }
  if (['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg'].includes(ext) || mime.startsWith('audio/')) {
    return 'AUDIO'
  }
  return 'DOCUMENT'
}

/**
 * Perform incremental or full indexing of connected Telegram dialogs.
 */
export async function startIndexing(options: { fullRescan?: boolean } = {}): Promise<void> {
  if (_scanStatus.status === 'scanning') {
    return
  }

  const client = await getTelegramClient()
  if (!client || !client.connected) {
    throw new Error('Telegram is not connected. Please authenticate first.')
  }

  _scanStatus = {
    status: 'scanning',
    indexedCount: 0,
    totalEstimated: 0,
  };

  // Run asynchronously
  (async () => {
    try {
      const existingData = readTelegramIndex()
      const mediaMap = new Map<string, TelegramMedia>()
      if (!options.fullRescan) {
        existingData.media.forEach(m => mediaMap.set(m.id, m))
      }

      const lastMsgMap = options.fullRescan ? {} : { ...existingData.lastMessageIdByChat }

      // Get dialogs
      const dialogs = await client.getDialogs({ limit: 100 })
      const chats: TelegramChat[] = []

      for (const d of dialogs) {
        if (!d.entity) continue
        const id = String(d.id)
        const title = d.title || (d.entity as any).firstName || (d.entity as any).username || 'Untitled Chat'
        const type: 'channel' | 'group' | 'chat' = (d.isChannel) ? 'channel' : (d.isGroup) ? 'group' : 'chat'
        const username = (d.entity as any).username || undefined

        chats.push({ id, title, type, username })
      }

      _scanStatus.totalEstimated = chats.length

      let newlyIndexed = 0

      // Iterate each chat
      for (const chat of chats) {
        _scanStatus.currentChatTitle = chat.title

        const minId = lastMsgMap[chat.id] || 0
        let maxSeenId = minId

        try {
          // Fetch messages from dialog
          const messages = await client.getMessages(chat.id, {
            limit: 200,
            minId: options.fullRescan ? undefined : minId,
          })

          for (const msg of messages) {
            if (msg.id > maxSeenId) {
              maxSeenId = msg.id
            }

            if (!msg.media) continue

            let doc: Api.Document | null = null
            if (msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document) {
              doc = msg.media.document
            }

            if (!doc) continue

            // Extract filename from attributes
            let filename = `telegram_file_${msg.id}`
            let duration: number | null = null
            let width: number | undefined
            let height: number | undefined

            if (doc.attributes) {
              for (const attr of doc.attributes) {
                if (attr instanceof Api.DocumentAttributeFilename) {
                  filename = attr.fileName
                } else if (attr instanceof Api.DocumentAttributeVideo) {
                  duration = attr.duration ? Math.round(attr.duration) : null
                  width = attr.w
                  height = attr.h
                } else if (attr instanceof Api.DocumentAttributeAudio) {
                  duration = attr.duration ? Math.round(attr.duration) : null
                  if (attr.title) {
                    filename = `${attr.performer ? attr.performer + ' - ' : ''}${attr.title}`
                  }
                }
              }
            }

            const ext = extractContainer(filename)
            const mimeType = doc.mimeType || 'application/octet-stream'

            // Prioritize video formats, especially MKV and MP4
            if (!SUPPORTED_EXTENSIONS.has(ext) && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) {
              continue
            }

            const mediaType = determineMediaType(ext, mimeType)
            const id = `tg_${chat.id}_${msg.id}`
            const fileSize = Number(doc.size)

            const mediaItem: TelegramMedia = {
              id,
              telegramMessageId: msg.id,
              chatId: chat.id,
              chatTitle: chat.title,
              filename,
              mimeType,
              fileSize,
              date: new Date(msg.date * 1000).toISOString(),
              duration,
              container: ext,
              mediaType,
              width,
              height,
              indexedAt: new Date().toISOString(),
            }

            // Preserve existing probed tracks or favorite status
            const existing = mediaMap.get(id)
            if (existing) {
              mediaItem.videoTracks = existing.videoTracks
              mediaItem.audioTracks = existing.audioTracks
              mediaItem.subtitleTracks = existing.subtitleTracks
              mediaItem.isFavorite = existing.isFavorite
            }

            mediaMap.set(id, mediaItem)
            newlyIndexed++
            _scanStatus.indexedCount = mediaMap.size
          }

          lastMsgMap[chat.id] = maxSeenId
        } catch (chatErr) {
          console.warn(`[Telegram Indexer] Error scanning chat ${chat.title}:`, (chatErr as Error).message)
        }
      }

      const updatedData: TelegramIndexData = {
        lastIndexedAt: new Date().toISOString(),
        chats,
        media: Array.from(mediaMap.values()),
        lastMessageIdByChat: lastMsgMap,
      }

      saveTelegramIndex(updatedData)

      _scanStatus = {
        status: 'done',
        indexedCount: updatedData.media.length,
        lastIndexedAt: updatedData.lastIndexedAt ?? undefined,
      }
    } catch (e) {
      console.error('[Telegram Indexer] Indexing failed:', e)
      _scanStatus = {
        status: 'error',
        indexedCount: 0,
        error: (e as Error).message,
      }
    }
  })()
}
