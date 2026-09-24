import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { createRequire } from 'module'
import { getTelegramMediaById } from '@/lib/telegram/telegramStore'
import { getTelegramClient, toBigInteger } from '@/lib/telegram/telegramClient'
import { Api } from 'telegram/tl'

function getFFprobePath(): string {
  try {
    const req = createRequire(import.meta.url)
    const installer = req('@ffprobe-installer/ffprobe')
    return installer?.path || 'ffprobe'
  } catch {
    return 'ffprobe'
  }
}

function formatVttTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function cleanSubtitleText(raw: string): string {
  return raw
    .replace(/\{[^}]+\}/g, '') // remove ASS/SSA override tags like {\an8}, {\pos(X,Y)}, {\b1}
    .replace(/\\N/g, '\n')     // convert ASS newline escapes to actual newlines
    .replace(/\\h/g, ' ')      // convert ASS hard spaces to spaces
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, '') // strip control chars and Unicode replacement
    .trim()
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { searchParams } = req.nextUrl
    const trackIndex = parseInt(searchParams.get('track') || '0', 10)
    const streamIndex = searchParams.get('streamIndex') ? parseInt(searchParams.get('streamIndex')!, 10) : undefined

    const media = getTelegramMediaById(id)
    if (!media) {
      return new NextResponse('WEBVTT\n\nNOTE Media not found', {
        status: 404,
        headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
      })
    }

    // Resolve subtitle stream index (s:0, s:1, ...)
    let subIdx = trackIndex
    if (streamIndex !== undefined && media.subtitleTracks && media.subtitleTracks.length > 0) {
      const byStream = media.subtitleTracks.findIndex(s => s.index === streamIndex)
      if (byStream !== -1) subIdx = byStream
    } else if (media.subtitleTracks && media.subtitleTracks.length > 0 && trackIndex >= media.subtitleTracks.length) {
      const byStream = media.subtitleTracks.findIndex(s => s.index === trackIndex)
      if (byStream !== -1) subIdx = byStream
    }

    // 1. Check cache on disk
    const cacheDir = path.join(os.tmpdir(), 'mltrack_sub_cache')
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true })
      } catch {}
    }
    const safeMediaId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cacheFile1 = path.join(cacheDir, `${safeMediaId}_sub_${subIdx}.vtt`)
    const cacheFile2 = path.join(cacheDir, `${safeMediaId}_sub_${trackIndex}.vtt`)
    const foundCache = fs.existsSync(cacheFile1) ? cacheFile1 : (fs.existsSync(cacheFile2) ? cacheFile2 : null)

    if (foundCache) {
      const cachedVtt = fs.readFileSync(foundCache, 'utf8')
      return new NextResponse(cachedVtt, {
        status: 200,
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }

    // 2. Identify media file source (local or remote)
    let targetFilePath: string | null = null
    let tempDownloadedFile: string | null = null

    const tgDesktopPath = path.join('C:\\Users\\essak\\Downloads\\Telegram Desktop', media.filename)
    if (fs.existsSync(tgDesktopPath)) {
      targetFilePath = tgDesktopPath
    } else if ((media as any).localPath && fs.existsSync((media as any).localPath)) {
      targetFilePath = (media as any).localPath
    }

    // Check if any existing downloaded chunk in tmp can be reused
    if (!targetFilePath) {
      try {
        const tmpFiles = fs.readdirSync(os.tmpdir())
          .filter(f => f.startsWith('sub_dl_') && f.endsWith(`.${media.container || 'mkv'}`))
        if (tmpFiles.length > 0) {
          let largest = ''
          let maxSize = 0
          for (const tf of tmpFiles) {
            try {
              const sz = fs.statSync(path.join(os.tmpdir(), tf)).size
              if (sz > maxSize) {
                maxSize = sz
                largest = tf
              }
            } catch {}
          }
          if (maxSize > 15 * 1024 * 1024) {
            targetFilePath = path.join(os.tmpdir(), largest)
          }
        }
      } catch {}
    }

    // If not local on disk, fetch from Telegram MTProto
    if (!targetFilePath) {
      const client = await getTelegramClient()
      if (!client || !client.connected) {
        return new NextResponse('WEBVTT\n\nNOTE Telegram not connected', {
          status: 503,
          headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
        })
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

      const messages = await client.getMessages(peer, { ids: [media.telegramMessageId] })
      const msg = messages[0]
      if (!msg || !msg.media) {
        return new NextResponse('WEBVTT\n\nNOTE Message media not accessible', {
          status: 404,
          headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
        })
      }

      let doc: Api.Document | null = null
      if (msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document) {
        doc = msg.media.document
      }

      if (!doc) {
        return new NextResponse('WEBVTT\n\nNOTE Invalid document', {
          status: 404,
          headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
        })
      }

      // Download first 15MB which contains subtitle tracks or cluster headers
      const downloadSize = Math.min(15 * 1024 * 1024, Number(doc.size))
      tempDownloadedFile = path.join(os.tmpdir(), `sub_dl_${Date.now()}.${media.container || 'mkv'}`)
      const writeStream = fs.createWriteStream(tempDownloadedFile)

      const downloadLocation = new Api.InputDocumentFileLocation({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference,
        thumbSize: '',
      })

      for await (const chunk of client.iterDownload({
        file: (msg.media || downloadLocation) as any,
        dcId: doc.dcId,
        offset: toBigInteger(0),
        limit: downloadSize,
        requestSize: 512 * 1024,
      })) {
        writeStream.write(chunk)
      }
      writeStream.end()
      await new Promise<void>((resolve) => writeStream.on('finish', () => resolve()))
      targetFilePath = tempDownloadedFile
    }

    // 3. Run ffprobe to dump subtitle packets
    const ffprobeBin = getFFprobePath()
    const args = [
      '-v', 'error',
      '-select_streams', `s:${subIdx}`,
      '-show_entries', 'packet=pts_time,duration_time,data',
      '-show_data',
      '-of', 'json',
      targetFilePath,
    ]

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(ffprobeBin, args, { maxBuffer: 25 * 1024 * 1024, timeout: 25000 }, (err, out) => {
        if (tempDownloadedFile && fs.existsSync(tempDownloadedFile)) {
          try { fs.unlinkSync(tempDownloadedFile) } catch {}
        }
        if (err) return reject(err)
        resolve(out || '{}')
      })
    })

    const parsed = JSON.parse(stdout)
    const packets = parsed.packets || []

    // 4. Construct standard WebVTT output
    let vtt = `WEBVTT - ${media.filename} (Track ${subIdx + 1})\n\n`
    let cueIndex = 1

    for (const p of packets) {
      if (!p.pts_time) continue
      const startSec = parseFloat(p.pts_time)
      const durSec = p.duration_time ? parseFloat(p.duration_time) : 2.5
      const endSec = startSec + Math.max(0.5, durSec)

      // Decode hex data
      const lines: string[] = p.data ? p.data.split('\n') : []
      const hex = lines.map((l: string) => {
        const m = l.match(/^[0-9a-fA-F]+:\s+((?:[0-9a-fA-F]{2,4}\s*)+)/)
        return m ? m[1].replace(/\s+/g, '') : ''
      }).join('')

      const text = cleanSubtitleText(Buffer.from(hex, 'hex').toString('utf8'))
      if (!text) continue

      vtt += `${cueIndex}\n`
      vtt += `${formatVttTime(startSec)} --> ${formatVttTime(endSec)}\n`
      vtt += `${text}\n\n`
      cueIndex++
    }

    if (cueIndex === 1) {
      // Empty subtitle track fallback
      vtt += `NOTE No text cues extracted for track ${subIdx}\n`
    }

    // Write to cache
    try {
      fs.writeFileSync(cacheFile1, vtt, 'utf8')
    } catch {}

    return new NextResponse(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err: any) {
    console.error('[Subtitles API Error]:', err)
    return new NextResponse(`WEBVTT\n\nNOTE Error extracting subtitles: ${err?.message}`, {
      status: 200,
      headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
    })
  }
}
