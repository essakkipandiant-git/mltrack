import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'
import type { MLTrackConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = getStorageFilePath('mltrack-config.json')

function readConfig(): MLTrackConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { courseRoot: '' }
  }
}

function writeConfig(config: MLTrackConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export async function GET() {
  const config = readConfig()
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { courseRoot: string }

    if (typeof body.courseRoot !== 'string') {
      return NextResponse.json({ error: 'courseRoot must be a string' }, { status: 400 })
    }

    const courseRoot = body.courseRoot.trim()

    // Validate the path exists if non-empty
    if (courseRoot) {
      try {
        const stat = fs.statSync(courseRoot)
        if (!stat.isDirectory()) {
          return NextResponse.json({ error: 'The specified path is not a directory.' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: `Directory not found: ${courseRoot}` }, { status: 400 })
      }
    }

    writeConfig({ courseRoot })
    return NextResponse.json({ ok: true, courseRoot })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
