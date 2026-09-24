import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getCachedFilePath } from '@/lib/playback/videoCache'
import { findLectureById, saveServerCourseCache } from '@/lib/course-scanner/serverCache'
import { scanCourse } from '@/lib/course-scanner/scanner'
import { validateAbsoluteCoursePath } from '@/lib/course-scanner/pathResolver'
import { getVideoMimeType } from '@/lib/course-scanner/contentDetector'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (!id) {
    return new NextResponse('Missing id parameter', { status: 400 })
  }

  // Validate id is a safe SHA1 hex string
  if (!/^[a-f0-9]{40}$/.test(id)) {
    return new NextResponse('Invalid id format', { status: 400 })
  }

  // ── Try cache first (ZIP-extracted videos) ────────────────────────────────
  let filePath = getCachedFilePath(id)

  // ── Fallback: loose file (not in a ZIP, no cache file) ────────────────────
  if (!filePath) {
    let lecture = findLectureById(id)
    if (!lecture) {
      try {
        const freshScan = await scanCourse()
        if (freshScan && (freshScan.days.length > 0 || freshScan.mentoring.length > 0)) {
          saveServerCourseCache(freshScan)
          lecture = findLectureById(id)
        }
      } catch {}
    }

    if (lecture && !lecture.sourceArchive && lecture.sourcePath) {
      // Loose file — validate path security and serve directly from disk
      try {
        const validated = validateAbsoluteCoursePath(lecture.sourcePath)
        if (fs.existsSync(validated)) {
          filePath = validated
        }
      } catch {
        return new NextResponse('Path security validation failed', { status: 403 })
      }
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return new NextResponse(
      'Video not ready. Call /api/video/prepare first.',
      { status: 404 }
    )
  }

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const contentType = getVideoMimeType(filePath)
  const rangeHeader = req.headers.get('range')

  if (rangeHeader) {
    // ── Partial content (seeking) ─────────────────────────────────────────
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (!rangeMatch) {
      return new NextResponse('Invalid Range header', { status: 416 })
    }

    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
    const end   = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1

    if (start > end || end >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const chunkSize = end - start + 1
    const nodeStream = fs.createReadStream(filePath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type':   contentType,
        'Cache-Control':  'no-store',
      },
    })
  }

  // ── Full file ─────────────────────────────────────────────────────────────
  const nodeStream = fs.createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type':   contentType,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-store',
    },
  })
}
