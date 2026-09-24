import { NextRequest, NextResponse } from 'next/server'
import { startIndexing, getScanStatus } from '@/lib/telegram/telegramIndexer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const status = getScanStatus()
  return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
  try {
    let fullRescan = false
    try {
      const body = await req.json()
      fullRescan = Boolean(body.fullRescan)
    } catch {}

    await startIndexing({ fullRescan })
    return NextResponse.json({ success: true, message: 'Indexing started' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to start indexing' }, { status: 400 })
  }
}
