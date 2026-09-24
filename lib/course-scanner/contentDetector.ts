import type { ContentType } from '@/lib/types'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.m4v'])
const MKV_EXTENSIONS = new Set(['.mkv']) // Browser playback limited; flagged as warning
const PDF_EXTENSIONS = new Set(['.pdf'])
const RESOURCE_EXTENSIONS = new Set(['.txt', '.docx', '.xlsx', '.pptx', '.md', '.html', '.htm', '.png', '.jpg', '.jpeg'])

/**
 * Classify a file by its extension.
 * Returns the content type and whether the file is directly browser-playable.
 */
export interface ClassifiedFile {
  contentType: ContentType
  browserPlayable: boolean
  warning?: string
}

export function classifyFile(filename: string): ClassifiedFile {
  const lower = filename.toLowerCase()
  const ext = getExtension(lower)

  if (VIDEO_EXTENSIONS.has(ext)) {
    return { contentType: 'VIDEO', browserPlayable: true }
  }

  if (MKV_EXTENSIONS.has(ext)) {
    return {
      contentType: 'VIDEO',
      browserPlayable: false,
      warning: `MKV format (${filename}) may not play in Chrome/Edge. Consider converting to MP4.`,
    }
  }

  if (PDF_EXTENSIONS.has(ext)) {
    return { contentType: 'PDF', browserPlayable: false }
  }

  if (RESOURCE_EXTENSIONS.has(ext)) {
    return { contentType: 'RESOURCE', browserPlayable: false }
  }

  return {
    contentType: 'OTHER',
    browserPlayable: false,
    warning: `Unsupported file type: ${filename}`,
  }
}

export function isVideoFile(filename: string): boolean {
  const ext = getExtension(filename.toLowerCase())
  return VIDEO_EXTENSIONS.has(ext) || MKV_EXTENSIONS.has(ext)
}

export function isPdfFile(filename: string): boolean {
  return getExtension(filename.toLowerCase()) === '.pdf'
}

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx) : ''
}

/**
 * Detect if a folder name represents an intentional self-study section.
 */
export function isSelfStudyFolder(name: string): boolean {
  return /self[\s_-]?study/i.test(name)
}

/**
 * Get MIME type for a video file based on extension.
 */
export function getVideoMimeType(filename: string): string {
  const ext = getExtension(filename.toLowerCase())
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/avi',
    '.m4v': 'video/x-m4v',
    '.mkv': 'video/x-matroska',
  }
  return map[ext] ?? 'video/mp4'
}
