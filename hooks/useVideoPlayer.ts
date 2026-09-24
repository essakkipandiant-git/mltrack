'use client'

import { useState, useCallback } from 'react'
import type { CourseItem } from '@/lib/types'

type PlayerState = 'idle' | 'preparing' | 'ready' | 'error'

export interface VideoPlayerState {
  playerState: PlayerState
  videoSrc: string | null
  errorMessage: string | null
  prepare: (lecture: CourseItem) => Promise<void>
}

/**
 * Manages video source preparation.
 * Sends ONLY the lectureId to /api/video/prepare.
 * The server securely looks up the lecture from its trusted cache,
 * resolves the archive or loose file path against COURSE_ROOT, extracts if needed,
 * and makes it available for streaming via /api/video/stream?id=<lectureId>.
 */
export function useVideoPlayer(): VideoPlayerState {
  const [playerState, setPlayerState] = useState<PlayerState>('idle')
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const prepare = useCallback(async (lecture: CourseItem) => {
    setPlayerState('preparing')
    setVideoSrc(null)
    setErrorMessage(null)

    try {
      // Securely request video preparation by stable lectureId only
      const res = await fetch('/api/video/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureId: lecture.id,
        }),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error ?? 'Video preparation failed')
      }

      // Stream via the Range-enabled video streaming endpoint
      setVideoSrc(`/api/video/stream?id=${lecture.id}`)
      setPlayerState('ready')
    } catch (e) {
      setPlayerState('error')
      setErrorMessage((e as Error).message)
    }
  }, [])

  return { playerState, videoSrc, errorMessage, prepare }
}
