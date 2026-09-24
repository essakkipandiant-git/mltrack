import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { readConfig } from '@/lib/course-scanner/scanner'
import { getVideoMimeType } from '@/lib/course-scanner/contentDetector'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const config = readConfig()

  if (!config.courseRoot) {
    return new NextResponse('Course root not configured', { status: 503 })
  }

  const { path: pathSegments } = await context.params

  // Reconstruct path from segments
  const relPath = pathSegments.join(path.sep)
  const absolutePath = path.resolve(config.courseRoot, relPath)

  // Security: ensure path stays within courseRoot
  const resolvedRoot = path.resolve(config.courseRoot)
  if (!absolutePath.startsWith(resolvedRoot + path.sep) && absolutePath !== resolvedRoot) {
    return new NextResponse('Path outside course root', { status: 403 })
  }

  if (!fs.existsSync(absolutePath)) {
    return new NextResponse('File not found', { status: 404 })
  }

  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) {
    return new NextResponse('Not a file', { status: 400 })
  }

  const fileSize = stat.size
  const contentType = getVideoMimeType(absolutePath)
  const rangeHeader = req.headers.get('range')

  if (rangeHeader) {
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (!rangeMatch) {
      return new NextResponse('Invalid Range', { status: 416 })
    }

    const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
    const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1

    if (start > end || end >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const chunkSize = end - start + 1
    const nodeStream = fs.createReadStream(absolutePath, { start, end })
    const webStream = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  }

  const nodeStream = fs.createReadStream(absolutePath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  })
}
