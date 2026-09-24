import { NextResponse } from 'next/server'
import { getTelegramAuthStatus } from '@/lib/telegram/telegramClient'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getTelegramAuthStatus()
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}
