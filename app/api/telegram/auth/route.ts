import { NextRequest, NextResponse } from 'next/server'
import {
  sendTelegramCode,
  signInTelegram,
  signInWithSessionString,
  logoutTelegram,
  getTelegramAuthStatus,
} from '@/lib/telegram/telegramClient'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === 'send-code') {
      const { apiId, apiHash, phoneNumber } = body
      if (!apiId || !apiHash || !phoneNumber) {
        return NextResponse.json({ error: 'apiId, apiHash, and phoneNumber are required.' }, { status: 400 })
      }
      const parsedApiId = parseInt(String(apiId), 10)
      if (isNaN(parsedApiId)) {
        return NextResponse.json({ error: 'apiId must be a valid number.' }, { status: 400 })
      }

      const res = await sendTelegramCode(parsedApiId, apiHash.trim(), phoneNumber.trim())
      return NextResponse.json({ success: true, phoneCodeHash: res.phoneCodeHash })
    }

    if (action === 'sign-in') {
      const { phoneCode, password } = body
      if (!phoneCode) {
        return NextResponse.json({ error: 'phoneCode is required.' }, { status: 400 })
      }

      const res = await signInTelegram(phoneCode.trim(), password ? password.trim() : undefined)
      return NextResponse.json({ success: true, user: res.user })
    }

    if (action === 'sign-in-session') {
      const { apiId, apiHash, sessionString } = body
      if (!apiId || !apiHash || !sessionString) {
        return NextResponse.json({ error: 'apiId, apiHash, and sessionString are required.' }, { status: 400 })
      }
      const parsedApiId = parseInt(String(apiId), 10)
      const res = await signInWithSessionString(parsedApiId, apiHash.trim(), sessionString.trim())
      return NextResponse.json({ success: true, user: res.user })
    }

    if (action === 'logout') {
      await logoutTelegram()
      return NextResponse.json({ success: true, connected: false })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e: any) {
    console.error('[API Telegram Auth Error]:', e)
    const msg = e?.message || 'Authentication error'
    const is2fa = msg.includes('2FA_REQUIRED')
    return NextResponse.json(
      { error: msg, is2fa },
      { status: 400 }
    )
  }
}
