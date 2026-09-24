import { NextResponse } from 'next/server'
import { readTelegramIndex } from '@/lib/telegram/telegramStore'
import { getTelegramClient } from '@/lib/telegram/telegramClient'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const index = readTelegramIndex()
    if (index.chats.length > 0) {
      return NextResponse.json({ chats: index.chats })
    }

    // If no indexed chats, try fetching from client directly if connected
    const client = await getTelegramClient()
    if (client && client.connected) {
      const dialogs = await client.getDialogs({ limit: 50 })
      const chats = dialogs
        .filter(d => d.entity)
        .map(d => ({
          id: String(d.id),
          title: d.title || (d.entity as any).firstName || 'Untitled Chat',
          type: d.isChannel ? 'channel' : d.isGroup ? 'group' : 'chat',
          username: (d.entity as any).username || undefined,
        }))
      return NextResponse.json({ chats })
    }

    return NextResponse.json({ chats: [] })
  } catch (e) {
    return NextResponse.json({ chats: [], error: (e as Error).message }, { status: 500 })
  }
}
