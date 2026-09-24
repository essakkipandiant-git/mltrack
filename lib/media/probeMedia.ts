import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'
import type { VideoTrackInfo, AudioTrackInfo, SubtitleTrackInfo } from '@/lib/types'

export interface ProbeResult {
  container: string
  duration?: number
  bitrate?: number
  videoTracks: VideoTrackInfo[]
  audioTracks: AudioTrackInfo[]
  subtitleTracks: SubtitleTrackInfo[]
}

function getFFprobePath(): string {
  try {
    const req = createRequire(import.meta.url)
    const installer = req('@ffprobe-installer/ffprobe')
    return installer?.path || 'ffprobe'
  } catch {
    return 'ffprobe'
  }
}


/**
 * Probes a local media file using ffprobe.
 */
export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      return resolve(fallbackProbe(filePath))
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]

    const bin = getFFprobePath()
    execFile(bin, args, { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout) {
        console.warn('[FFprobe] Probe failed or timed out:', err?.message)
        return resolve(fallbackProbe(filePath))
      }

      try {
        const data = JSON.parse(stdout)
        const result = parseFFprobeOutput(data)
        resolve(result)
      } catch (parseErr) {
        console.warn('[FFprobe] Failed to parse JSON output:', parseErr)
        resolve(fallbackProbe(filePath))
      }
    })
  })
}

/**
 * Probes media from a Buffer (e.g. first 2MB-4MB of a Telegram MKV/MP4 stream).
 * Writes the buffer to a temporary file, probes it, and cleans up.
 */
export async function probeMediaBuffer(buffer: Buffer, originalExt = 'mkv'): Promise<ProbeResult> {
  const tempDir = os.tmpdir()
  const tempFile = path.join(tempDir, `mltrack_probe_${Date.now()}.${originalExt}`)

  try {
    fs.writeFileSync(tempFile, buffer)
    const result = await probeMediaFile(tempFile)
    return result
  } catch (e) {
    console.warn('[FFprobe Buffer] Error probing buffer:', e)
    return fallbackProbe(tempFile)
  } finally {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile)
    } catch {}
  }
}

function parseFFprobeOutput(data: any): ProbeResult {
  const format = data.format || {}
  const streams = Array.isArray(data.streams) ? data.streams : []

  const videoTracks: VideoTrackInfo[] = []
  const audioTracks: AudioTrackInfo[] = []
  const subtitleTracks: SubtitleTrackInfo[] = []

  streams.forEach((stream: any, index: number) => {
    const tags = stream.tags || {}
    const disposition = stream.disposition || {}

    if (stream.codec_type === 'video') {
      let fps: number | undefined
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split('/').map(Number)
        if (den && den > 0) fps = Math.round(num / den)
      }

      videoTracks.push({
        index,
        codec: (stream.codec_name || 'unknown').toUpperCase(),
        width: Number(stream.width) || 0,
        height: Number(stream.height) || 0,
        fps,
        bitrate: stream.bit_rate ? Number(stream.bit_rate) : undefined,
      })
    } else if (stream.codec_type === 'audio') {
      const lang = tags.language || tags.LANGUAGE
      const title = tags.title || tags.TITLE || formatAudioTitle(stream, lang)

      audioTracks.push({
        index,
        codec: (stream.codec_name || 'unknown').toUpperCase(),
        language: lang,
        title,
        channels: Number(stream.channels) || 2,
        sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
        bitrate: stream.bit_rate ? Number(stream.bit_rate) : undefined,
        isDefault: Boolean(disposition.default),
      })
    } else if (stream.codec_type === 'subtitle') {
      const lang = tags.language || tags.LANGUAGE
      const title = tags.title || tags.TITLE || (lang ? formatLanguageName(lang) : `Subtitle ${subtitleTracks.length + 1}`)

      subtitleTracks.push({
        index,
        codec: (stream.codec_name || 'unknown').toUpperCase(),
        language: lang,
        title,
        isDefault: Boolean(disposition.default),
        isForced: Boolean(disposition.forced),
      })
    }
  })

  // Format container name
  let container = (format.format_name || 'matroska').split(',')[0].trim()
  if (container.includes('matroska')) container = 'mkv'
  if (container.includes('mp4')) container = 'mp4'

  return {
    container,
    duration: format.duration ? parseFloat(format.duration) : undefined,
    bitrate: format.bit_rate ? parseInt(format.bit_rate, 10) : undefined,
    videoTracks,
    audioTracks,
    subtitleTracks,
  }
}

function formatAudioTitle(stream: any, lang?: string): string {
  const langName = lang ? formatLanguageName(lang) : 'Track'
  const channels = stream.channels === 6 ? '5.1' : stream.channels === 2 ? 'Stereo' : stream.channels ? `${stream.channels}ch` : ''
  const codec = (stream.codec_name || '').toUpperCase()
  return [langName, channels, codec].filter(Boolean).join(' ')
}

function formatLanguageName(code: string): string {
  const map: Record<string, string> = {
    eng: 'English',
    en: 'English',
    hin: 'Hindi',
    hi: 'Hindi',
    jpn: 'Japanese',
    ja: 'Japanese',
    tam: 'Tamil',
    ta: 'Tamil',
    tel: 'Telugu',
    te: 'Telugu',
    spa: 'Spanish',
    es: 'Spanish',
    fra: 'French',
    fr: 'French',
    ger: 'German',
    de: 'German',
    rus: 'Russian',
    ru: 'Russian',
    zho: 'Chinese',
    zh: 'Chinese',
  }
  return map[code.toLowerCase()] || code.toUpperCase()
}

function fallbackProbe(filePath: string): ProbeResult {
  const ext = path.extname(filePath).replace('.', '').toLowerCase() || 'mkv'
  return {
    container: ext,
    videoTracks: [{
      index: 0,
      codec: 'H264',
      width: 1920,
      height: 1080,
    }],
    audioTracks: [{
      index: 1,
      codec: 'AAC',
      channels: 2,
      title: 'Default Audio (Stereo)',
      isDefault: true,
    }],
    subtitleTracks: [],
  }
}
