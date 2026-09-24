import { NextRequest, NextResponse } from 'next/server'
import { loadServerCourseCache, saveServerCourseCache } from '@/lib/course-scanner/serverCache'
import { scanCourse, readConfig } from '@/lib/course-scanner/scanner'
import type { ScanResult } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    let cache = loadServerCourseCache()

    // If cache not found on disk, auto-scan if courseRoot is configured
    if (!cache || (cache.days.length === 0 && cache.mentoring.length === 0)) {
      const config = readConfig()
      if (config.courseRoot) {
        try {
          const freshScan = await scanCourse(config.courseRoot)
          if (freshScan && (freshScan.days.length > 0 || freshScan.mentoring.length > 0)) {
            saveServerCourseCache(freshScan)
            cache = freshScan
          }
        } catch (scanErr) {
          console.error('[Course API] Auto-scan error:', scanErr)
        }
      }
    }

    return NextResponse.json({ course: cache })
  } catch (e) {
    return NextResponse.json({ course: null, error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ScanResult
    if (body) {
      saveServerCourseCache(body)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Invalid course data' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
