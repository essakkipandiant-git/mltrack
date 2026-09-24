import { NextRequest, NextResponse } from 'next/server'
import type { ManualAssignment } from '@/lib/types'
import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'

export const dynamic = 'force-dynamic'

// Store assignments in a local JSON file (gitignored)
const ASSIGNMENTS_PATH = getStorageFilePath('mltrack-assignments.json')

function readAssignments(): ManualAssignment[] {
  try {
    const raw = fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeAssignments(assignments: ManualAssignment[]): void {
  fs.writeFileSync(ASSIGNMENTS_PATH, JSON.stringify(assignments, null, 2), 'utf-8')
}

export async function GET() {
  return NextResponse.json(readAssignments())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ManualAssignment | ManualAssignment[]
    const incoming = Array.isArray(body) ? body : [body]

    const existing = readAssignments()
    const map = new Map(existing.map(a => [a.itemId, a]))

    for (const a of incoming) {
      if (!a.itemId) continue
      map.set(a.itemId, { ...a, assignedAt: new Date().toISOString() })
    }

    const updated = Array.from(map.values())
    writeAssignments(updated)

    return NextResponse.json({ ok: true, count: updated.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
