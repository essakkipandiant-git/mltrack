import { NextRequest, NextResponse } from 'next/server'
import { isCached, extractToCache } from '@/lib/playback/videoCache'
import { findLectureById, saveServerCourseCache } from '@/lib/course-scanner/serverCache'
import { scanCourse } from '@/lib/course-scanner/scanner'
import { resolveCoursePath, validateAbsoluteCoursePath, getCourseRoot } from '@/lib/course-scanner/pathResolver'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Accept only the lectureId from the browser.
    // The server resolves the archive path itself from trusted metadata.
    // The browser CANNOT dictate which file on disk to open.
    const body = await req.json() as { lectureId: string }
    const { lectureId } = body

    if (!lectureId || typeof lectureId !== 'string') {
      return NextResponse.json({ error: 'lectureId is required' }, { status: 400 })
    }

    // Validate lectureId format (SHA1 hex)
    if (!/^[a-f0-9]{40}$/.test(lectureId)) {
      return NextResponse.json({ error: 'Invalid lectureId format' }, { status: 400 })
    }

    // Fast path: already cached on disk
    if (isCached(lectureId)) {
      console.log(`[MLTrack Video Prepare] lectureId=${lectureId} → already cached`)
      return NextResponse.json({ ready: true, lectureId })
    }

    // Look up lecture from server-side trusted cache (NOT from browser)
    let lecture = findLectureById(lectureId)

    // If not found in server cache, auto-rebuild server cache from configured courseRoot
    if (!lecture) {
      try {
        console.log(`[MLTrack Video Prepare] Server cache miss for ${lectureId}. Rebuilding cache...`)
        const freshScan = await scanCourse()
        if (freshScan && (freshScan.days.length > 0 || freshScan.mentoring.length > 0)) {
          saveServerCourseCache(freshScan)
          lecture = findLectureById(lectureId)
        }
      } catch (scanErr) {
        console.error('[MLTrack Video Prepare] Auto-scan error:', scanErr)
      }
    }

    if (!lecture) {
      return NextResponse.json({
        error: 'Lecture not found in server course library. Please ensure your course folder is configured and scanned in Import / Library.',
      }, { status: 404 })
    }

    const courseRoot = getCourseRoot()

    console.log(`[MLTrack Video Prepare]`)
    console.log(`  lectureId:       ${lectureId}`)
    console.log(`  title:           ${lecture.title}`)
    console.log(`  sourceArchive:   ${lecture.sourceArchive ?? '(loose file)'}`)
    console.log(`  sourcePath:      ${lecture.sourcePath}`)
    console.log(`  courseRoot:      ${courseRoot}`)

    if (lecture.sourceArchive) {
      // ── ZIP-sourced video ────────────────────────────────────────────────
      // sourceArchive = "Day-1.zip" (relative to courseRoot)
      // sourcePath    = "Course Introduction/01 Course Objective.mp4" (internal)

      // Resolve archive to absolute path safely via pathResolver
      const archivePath = resolveCoursePath(lecture.sourceArchive)

      console.log(`  resolvedArchive: ${archivePath}`)
      console.log(`  archiveExists:   ${fs.existsSync(archivePath)}`)

      if (!fs.existsSync(archivePath)) {
        return NextResponse.json({
          error: `Course archive not found on disk: ${lecture.sourceArchive}. Make sure your Course Folder path is set correctly in Settings.`,
        }, { status: 404 })
      }

      // Extract only the selected video entry
      await extractToCache(archivePath, lecture.sourcePath, lectureId)

      console.log(`  → Extracted successfully to cache`)
      return NextResponse.json({ ready: true, lectureId })

    } else {
      // ── Loose file (not in a ZIP) ────────────────────────────────────────
      // sourcePath = absolute path stored during scanning
      // Validate it's still within courseRoot
      try {
        const validatedPath = validateAbsoluteCoursePath(lecture.sourcePath)
        console.log(`  resolvedLoose:   ${validatedPath}`)
        console.log(`  looseExists:     ${fs.existsSync(validatedPath)}`)

        if (!fs.existsSync(validatedPath)) {
          return NextResponse.json({
            error: `Loose video file not found: ${path.basename(lecture.sourcePath)}`,
          }, { status: 404 })
        }

        // Loose files don't need extraction — mark as ready (streamed directly)
        return NextResponse.json({ ready: true, lectureId, loose: true, loosePath: lecture.sourcePath })
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 403 })
      }
    }

  } catch (e) {
    console.error('[MLTrack Video Prepare] Error:', (e as Error).message)
    return NextResponse.json(
      { error: `Video preparation failed: ${(e as Error).message}` },
      { status: 500 }
    )
  }
}
