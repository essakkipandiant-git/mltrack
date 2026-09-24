import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// In-memory scan status (server-side singleton)
type ScanStatusValue = 'idle' | 'scanning' | 'done' | 'error'
export let scanStatus: ScanStatusValue = 'idle'
export let lastError: string | null = null

export async function GET() {
  return NextResponse.json({ status: scanStatus, error: lastError })
}
