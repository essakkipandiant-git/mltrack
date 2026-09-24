import { NextRequest, NextResponse } from 'next/server'
import { getTelegramMediaById, updateTelegramMediaItem } from '@/lib/telegram/telegramStore'
import { getTelegramClient, toBigInteger } from '@/lib/telegram/telegramClient'
import fs from 'fs'
import path from 'path'
import { probeMediaBuffer, probeMediaFile } from '@/lib/media/probeMedia'
import { Api } from 'telegram/tl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const item = getTelegramMediaById(id)

  if (!item) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  return NextResponse.json({ item })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const item = getTelegramMediaById(id)

  if (!item) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  // If already probed, return existing tracks
  if (item.audioTracks && item.audioTracks.length > 0 && item.videoTracks && item.videoTracks.length > 0) {
    return NextResponse.json({ item })
  }

  // 1. Check if media exists locally in Telegram Desktop or localPath
  try {
    let localFilePath: string | null = null
    const tgDesktopPath = path.join('C:\\Users\\essak\\Downloads\\Telegram Desktop', item.filename)
    if (fs.existsSync(tgDesktopPath)) {
      localFilePath = tgDesktopPath
    } else if ((item as any).localPath && fs.existsSync((item as any).localPath)) {
      localFilePath = (item as any).localPath
    }

    if (localFilePath) {
      const probeRes = await probeMediaFile(localFilePath)
      const updated = updateTelegramMediaItem(item.id, {
        videoTracks: probeRes.videoTracks,
        audioTracks: probeRes.audioTracks,
        subtitleTracks: probeRes.subtitleTracks,
        duration: probeRes.duration ? Math.round(probeRes.duration) : item.duration,
      })
      return NextResponse.json({ item: updated || item })
    }
  } catch (localErr) {
    console.warn('[Probe Media API] Local probe error:', localErr)
  }

  // 2. Probe using initial bytes from Telegram MTProto
  try {
    const client = await getTelegramClient()
    if (!client || !client.connected) {
      return NextResponse.json({ item })
    }

    let peer: any = item.chatId
    try {
      peer = await client.getInputEntity(item.chatId)
    } catch {
      try {
        await client.getDialogs({ limit: 80 })
        peer = await client.getInputEntity(item.chatId)
      } catch {
        peer = item.chatId
      }
    }

    const messages = await client.getMessages(peer, { ids: [item.telegramMessageId] })
    const msg = messages[0]
    if (!msg || !msg.media) {
      return NextResponse.json({ item })
    }

    let doc: Api.Document | null = null
    if (msg.media instanceof Api.MessageMediaDocument && msg.media.document instanceof Api.Document) {
      doc = msg.media.document
    }

    if (!doc) {
      return NextResponse.json({ item })
    }

    const downloadLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: '',
    })

    // Fetch initial 3MB to probe container header (EBML tracks in MKV / moov in MP4)
    const probeSize = Math.min(3 * 1024 * 1024, Number(doc.size))
    const chunks: Buffer[] = []
    let downloadedBytes = 0

    for await (const chunk of client.iterDownload({
      file: (msg.media || downloadLocation) as any,
      dcId: doc.dcId,
      offset: toBigInteger(0),
      limit: probeSize,
      requestSize: 512 * 1024,
    })) {
      chunks.push(chunk as Buffer)
      downloadedBytes += chunk.length
      if (downloadedBytes >= probeSize) break
    }

    if (chunks.length > 0) {
      const fullBuffer = Buffer.concat(chunks)
      const probeRes = await probeMediaBuffer(fullBuffer, item.container || 'mkv')

      const updated = updateTelegramMediaItem(item.id, {
        videoTracks: probeRes.videoTracks,
        audioTracks: probeRes.audioTracks,
        subtitleTracks: probeRes.subtitleTracks,
        duration: probeRes.duration ? Math.round(probeRes.duration) : item.duration,
      })

      return NextResponse.json({ item: updated || item })
    }
  } catch (probeErr) {
    console.warn('[Probe Media API] Error during probe:', probeErr)
  }

  return NextResponse.json({ item })
}
