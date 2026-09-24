import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { getTelegramMediaById } from '@/lib/telegram/telegramStore'
import { getTelegramClient, toBigInteger } from '@/lib/telegram/telegramClient'
import { Api } from 'telegram/tl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const media = getTelegramMediaById(id)

    if (!media) {
      return new NextResponse('Media not found in index', { status: 404 })
    }

    // Check if file exists locally on disk in Telegram Desktop
    let localFilePath: string | null = null
    const tgDesktopPath = path.join('C:\\Users\\essak\\Downloads\\Telegram Desktop', media.filename)
    if (fs.existsSync(tgDesktopPath)) {
      localFilePath = tgDesktopPath
    } else if ((media as any).localPath && fs.existsSync((media as any).localPath)) {
      localFilePath = (media as any).localPath
    }

    if (localFilePath) {
      const stat = fs.statSync(localFilePath)
      const fileSize = stat.size
      const ext = media.container.toLowerCase()
      let contentType = media.mimeType || 'video/mp4'
      if (ext === 'mkv') contentType = 'video/x-matroska'
      else if (ext === 'mp4') contentType = 'video/mp4'
      else if (ext === 'webm') contentType = 'video/webm'

      const rangeHeader = req.headers.get('range')
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        if (!rangeMatch) {
          return new NextResponse('Invalid Range header', { status: 416 })
        }
        const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1
        if (start > end || end >= fileSize) {
          return new NextResponse('Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          })
        }
        const chunkSize = end - start + 1
        const nodeStream = fs.createReadStream(localFilePath, { start, end })
        const webStream = Readable.toWeb(nodeStream) as ReadableStream

        return new NextResponse(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
          },
        })
      }

      const nodeStream = fs.createReadStream(localFilePath)
      const webStream = Readable.toWeb(nodeStream) as ReadableStream
      return new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      })
    }

    const client = await getTelegramClient()
    if (!client || !client.connected) {
      return new NextResponse('Telegram client not connected', { status: 503 })
    }

    let peer: any = media.chatId
    try {
      peer = await client.getInputEntity(media.chatId)
    } catch {
      try {
        await client.getDialogs({ limit: 80 })
        peer = await client.getInputEntity(media.chatId)
      } catch {
        peer = media.chatId
      }
    }

    // Retrieve the specific message
    const messages = await client.getMessages(peer, {
      ids: [media.telegramMessageId],
    })

    const msg = messages[0]
    if (!msg || !msg.media) {
      return new NextResponse('Telegram media is no longer accessible', { status: 404 })
    }

    let doc: Api.Document | null = null
    if (msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document) {
      doc = msg.media.document
    }

    if (!doc) {
      return new NextResponse('Invalid Telegram media document', { status: 404 })
    }

    const fileSize = Number(doc.size)
    const ext = media.container.toLowerCase()
    let contentType = media.mimeType || 'video/mp4'
    if (ext === 'mkv') contentType = 'video/x-matroska'
    else if (ext === 'mp4') contentType = 'video/mp4'
    else if (ext === 'webm') contentType = 'video/webm'
    else if (ext === 'mov') contentType = 'video/quicktime'
    else if (ext === 'avi') contentType = 'video/x-msvideo'
    else if (ext === 'mp3') contentType = 'audio/mpeg'

    const rangeHeader = req.headers.get('range')

    if (rangeHeader) {
      // ── Range Request (Seeking / Buffered Playback) ──────────────────────────
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (!rangeMatch) {
        return new NextResponse('Invalid Range header', { status: 416 })
      }

      const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1

      if (start > end || end >= fileSize) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        })
      }

      const chunkSize = end - start + 1
      let isCancelled = false
      let isClosed = false

      // Telegram MTProto requires offset to be divisible by 4096 (4KB)
      const alignedStart = Math.floor(start / 4096) * 4096
      let skipBytes = start - alignedStart
      let remainingToSend = chunkSize

      const downloadLocation = new Api.InputDocumentFileLocation({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference,
        thumbSize: '',
      })

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of client.iterDownload({
              file: (msg.media || downloadLocation) as any,
              dcId: doc.dcId,
              offset: toBigInteger(alignedStart),
              limit: chunkSize + skipBytes,
              requestSize: 512 * 1024,
            })) {
              if (isCancelled || isClosed) break

              let data = chunk as Buffer
              if (skipBytes > 0) {
                if (data.length <= skipBytes) {
                  skipBytes -= data.length
                  continue
                } else {
                  data = data.subarray(skipBytes)
                  skipBytes = 0
                }
              }

              if (data.length > remainingToSend) {
                data = data.subarray(0, remainingToSend)
              }

              remainingToSend -= data.length
              controller.enqueue(data)

              if (remainingToSend <= 0) break
            }
            if (!isCancelled && !isClosed) {
              isClosed = true
              try { controller.close() } catch {}
            }
          } catch (err: any) {
            if (!isCancelled && !isClosed) {
              isClosed = true
              try { controller.error(err) } catch {}
            }
          }
        },
        cancel() {
          isCancelled = true
          isClosed = true
        },
      })

      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      })
    }

    // ── Full content (no Range header) ─────────────────────────────────────────
    let isCancelled = false
    let isClosed = false
    const downloadLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: '',
    })

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of client.iterDownload({
            file: (msg.media || downloadLocation) as any,
            dcId: doc.dcId,
            offset: toBigInteger(0),
            limit: fileSize,
            requestSize: 512 * 1024,
          })) {
            if (isCancelled || isClosed) break
            controller.enqueue(chunk)
          }
          if (!isCancelled && !isClosed) {
            isClosed = true
            try { controller.close() } catch {}
          }
        } catch (err: any) {
          if (!isCancelled && !isClosed) {
            isClosed = true
            try { controller.error(err) } catch {}
          }
        }
      },
      cancel() {
        isCancelled = true
        isClosed = true
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })

  } catch (e: any) {
    console.error('[Telegram Stream Error]:', e)
    return new NextResponse(`Streaming error: ${e?.message}`, { status: 500 })
  }
}
