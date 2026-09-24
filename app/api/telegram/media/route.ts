import { NextRequest, NextResponse } from 'next/server'
import { queryTelegramMedia } from '@/lib/telegram/telegramStore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const q = searchParams.get('q') || undefined
    const filter = (searchParams.get('filter') as any) || undefined
    const chatId = searchParams.get('chatId') || undefined
    const sort = (searchParams.get('sort') as any) || undefined
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 24
    const favsParam = searchParams.get('favorites')
    const favorites = favsParam ? favsParam.split(',') : undefined

    const result = queryTelegramMedia({
      q,
      filter,
      chatId,
      sort,
      page,
      limit,
      favorites,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error querying media' }, { status: 500 })
  }
}
