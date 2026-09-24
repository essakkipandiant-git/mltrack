import { NextRequest, NextResponse } from 'next/server'
import { scanCourse } from '@/lib/course-scanner/scanner'
import { saveServerCourseCache } from '@/lib/course-scanner/serverCache'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { courseRoot?: string }
    const courseRoot = typeof body.courseRoot === 'string'
      ? body.courseRoot.trim().replace(/^["']|["']$/g, '')
      : undefined

    const result = await scanCourse(courseRoot)

    // Save to server-side cache so the video prepare endpoint can look up
    // lecture metadata without trusting paths from the browser
    saveServerCourseCache(result)

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: `Scan failed: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
