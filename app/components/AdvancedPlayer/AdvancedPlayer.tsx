'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings as SettingsIcon, Subtitles as SubtitlesIcon,
  Headphones, Check, Clock, ChevronRight, ChevronLeft, X,
  FileText, MonitorPlay, RotateCcw, RotateCw, Upload, Heart, BookmarkPlus
} from 'lucide-react'
import { Badge, ProgressBar, formatTime } from '../shared'
import { saveMediaProgress, getMediaProgress } from '@/lib/storage/mediaProgress'
import { addToHistory } from '@/lib/storage/history'
import { toggleFavorite, isFavorite } from '@/lib/storage/favorites'
import type { CourseItem, TelegramMedia, AudioTrackInfo, SubtitleTrackInfo, VideoTrackInfo } from '@/lib/types'

export type PlayableItem =
  | { type: 'course'; data: CourseItem }
  | { type: 'telegram'; data: TelegramMedia }

interface AdvancedPlayerProps {
  item: PlayableItem
  onBack: () => void
  onNavigateNext?: () => void
  onNavigatePrev?: () => void
  hasNext?: boolean
  hasPrev?: boolean
}

type MenuPage = 'main' | 'speed' | 'audio' | 'subtitles' | 'subDelay' | 'audioDelay' | 'quality'

export interface ParsedCue {
  start: number
  end: number
  text: string
}

export function parseSubtitleText(raw: string): ParsedCue[] {
  const cues: ParsedCue[] = []
  if (!raw || typeof raw !== 'string') return cues
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = text.split(/\n\s*\n/)

  const timeToSeconds = (tStr: string): number => {
    const parts = tStr.trim().replace(',', '.').split(':')
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
    }
    return parseFloat(tStr) || 0
  }

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const timeLineIdx = lines.findIndex(l => l.includes('-->'))
    if (timeLineIdx === -1) continue

    const [startStr, endStr] = lines[timeLineIdx].split('-->')
    if (!startStr || !endStr) continue

    const start = timeToSeconds(startStr.trim().split(' ')[0])
    const end = timeToSeconds(endStr.trim().split(' ')[0])

    const cueLines = lines.slice(timeLineIdx + 1)
    const cueText = cueLines
      .join('\n')
      .replace(/<[^>]+>/g, '') // strip HTML/VTT styling
      .replace(/\{[^}]+\}/g, '') // strip ASS/SSA styling tags
      .replace(/\\N/g, '\n')
      .replace(/\\h/g, ' ')
      .trim()

    if (cueText && !isNaN(start) && !isNaN(end) && end > start) {
      cues.push({ start, end, text: cueText })
    }
  }

  return cues
}

const COMPLETION_THRESHOLD = 0.92

export function AdvancedPlayer({
  item,
  onBack,
  onNavigateNext,
  onNavigatePrev,
  hasNext,
  hasPrev,
}: AdvancedPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stream state
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Playback state
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [theaterMode, setTheaterMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Media identification
  const isTg = item.type === 'telegram'
  const mediaId = isTg ? item.data.id : item.data.id
  const title = isTg ? item.data.filename : item.data.title
  const subTitle = isTg ? item.data.chatTitle : (item.data.folderPath[0] || 'Course Lecture')
  const fileSize = isTg ? item.data.fileSize : item.data.sizeBytes
  const container = isTg ? item.data.container.toUpperCase() : 'MP4'

  // Format file size
  const formatBytes = (bytes: number) => {
    if (!bytes) return ''
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Track & Delay state - initialized directly from item.data for instant UI visibility
  const [videoTracks, setVideoTracks] = useState<VideoTrackInfo[]>(() => isTg && item.data.videoTracks ? item.data.videoTracks : [])
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>(() => isTg && item.data.audioTracks ? item.data.audioTracks : [])
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackInfo[]>(() => isTg && item.data.subtitleTracks ? item.data.subtitleTracks : [])
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0)
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number>(-1) // -1 = off
  const [subtitleDelay, setSubtitleDelay] = useState<number>(0)
  const [audioDelay, setAudioDelay] = useState<number>(0)

  // Subtitle cue rendering state
  const [subtitleCues, setSubtitleCues] = useState<ParsedCue[]>([])
  const [activeSubtitleText, setActiveSubtitleText] = useState<string | null>(null)
  const [subtitleLoading, setSubtitleLoading] = useState(false)
  const [subtitleStatus, setSubtitleStatus] = useState<string | null>(null)

  // UI state
  const [controlsVisible, setControlsVisible] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuPage, setMenuPage] = useState<MenuPage>('main')
  const [showResume, setShowResume] = useState(false)
  const [resumePos, setResumePos] = useState<number>(0)
  const [isFav, setIsFav] = useState(false)
  const [externalSubtitles, setExternalSubtitles] = useState<{ label: string; url: string }[]>([])
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 1. Initialize Stream Source & Probed Tracks
  useEffect(() => {
    let active = true
    setLoading(true)
    setErrorMessage(null)
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    // Check favorite
    isFavorite(mediaId)
      .then(fav => {
        if (active) setIsFav(fav)
      })
      .catch(() => {})

    if (item.type === 'course') {
      // Prepare local lecture
      fetch('/api/video/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId: item.data.id }),
      })
        .then(r => r.json())
        .then(d => {
          if (!active) return
          if (d.error) throw new Error(d.error)
          setVideoSrc(`/api/video/stream?id=${item.data.id}`)
          setLoading(false)
        })
        .catch(err => {
          if (!active) return
          setLoading(false)
          setErrorMessage(err.message)
        })
    } else {
      // Initialize immediately from current item data
      if (item.data.videoTracks?.length) setVideoTracks(item.data.videoTracks)
      if (item.data.audioTracks?.length) setAudioTracks(item.data.audioTracks)
      if (item.data.subtitleTracks?.length) setSubtitleTracks(item.data.subtitleTracks)

      // Telegram stream
      setVideoSrc(`/api/telegram/stream/${item.data.id}`)
      setLoading(false)

      // Fetch or probe tracks in background
      fetch(`/api/telegram/media/${item.data.id}`, { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (!active || !d.item) return
          if (d.item.videoTracks?.length) setVideoTracks(d.item.videoTracks)
          if (d.item.audioTracks?.length) setAudioTracks(d.item.audioTracks)
          if (d.item.subtitleTracks?.length) setSubtitleTracks(d.item.subtitleTracks)
        })
        .catch(() => {})
    }

    // Check for saved resume position
    getMediaProgress(mediaId)
      .then(prog => {
        if (!active) return
        if (prog && prog.currentPosition > 10 && !prog.completed) {
          setResumePos(prog.currentPosition)
          setShowResume(true)
        }
        if (prog?.playbackSpeed) {
          setSpeed(prog.playbackSpeed)
          if (videoRef.current) videoRef.current.playbackRate = prog.playbackSpeed
        }
        if (prog?.selectedAudioTrack !== undefined) setSelectedAudioTrack(prog.selectedAudioTrack)
        if (prog?.selectedSubtitleTrack !== undefined) setSelectedSubtitleTrack(prog.selectedSubtitleTrack)
        if (prog?.subtitleDelay !== undefined) setSubtitleDelay(prog.subtitleDelay)
        if (prog?.audioDelay !== undefined) setAudioDelay(prog.audioDelay)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [mediaId, item.type])

  // 2. Playback progress tracking & throttling
  const saveProgressThrottled = useCallback(
    (() => {
      let lastSave = 0
      return (pos: number, dur: number) => {
        const now = Date.now()
        if (now - lastSave > 4000) {
          lastSave = now
          const percentage = dur > 0 ? Math.round((pos / dur) * 100) : 0
          saveMediaProgress(mediaId, {
            title,
            subTitle,
            currentPosition: pos,
            duration: dur,
            percentage,
            selectedAudioTrack,
            selectedSubtitleTrack,
            subtitleDelay,
            audioDelay,
            playbackSpeed: speed,
          })

          addToHistory({
            lectureId: mediaId,
            title,
            dayLabel: subTitle,
            lastPosition: pos,
            percentage,
            watchedAt: new Date().toISOString(),
          })
        }
      }
    })(),
    [mediaId, title, subTitle, selectedAudioTrack, selectedSubtitleTrack, subtitleDelay, audioDelay, speed]
  )

  // 3. Time update & buffering
  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const ct = v.currentTime
    const dur = v.duration || 0
    setCurrentTime(ct)
    setDuration(dur)
    saveProgressThrottled(ct, dur)

    // Synchronize Cinema Subtitle overlay
    if (subtitleCues.length > 0) {
      const effectiveTime = ct + subtitleDelay
      const match = subtitleCues.find(c => effectiveTime >= c.start && effectiveTime <= c.end)
      setActiveSubtitleText(match ? match.text : null)
    } else if (activeSubtitleText) {
      setActiveSubtitleText(null)
    }

    // Calculate buffered range
    if (v.buffered.length > 0) {
      for (let i = v.buffered.length - 1; i >= 0; i--) {
        if (v.buffered.start(i) <= ct) {
          setBufferedEnd(v.buffered.end(i))
          break
        }
      }
    }
  }

  // 4. Activity timer to hide controls
  const handleMouseMove = () => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (playing) {
      hideTimerRef.current = setTimeout(() => {
        if (!settingsOpen) setControlsVisible(false)
      }, 3000)
    }
  }

  // 5. Controls Actions
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {})
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  const seek = (seconds: number) => {
    const v = videoRef.current
    if (!v) return
    const target = Math.max(0, Math.min(duration || Infinity, seconds))
    v.currentTime = target
    setCurrentTime(target)

    if (subtitleCues.length > 0) {
      const effectiveTime = target + subtitleDelay
      const match = subtitleCues.find(c => effectiveTime >= c.start && effectiveTime <= c.end)
      setActiveSubtitleText(match ? match.text : null)
    }
  }

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed)
    if (videoRef.current) videoRef.current.playbackRate = newSpeed
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !muted
    setMuted(!muted)
  }

  const handleVolumeChange = (newVol: number) => {
    const v = videoRef.current
    if (!v) return
    const val = Math.max(0, Math.min(1, newVol))
    v.volume = val
    setVolume(val)
    if (val > 0 && muted) {
      v.muted = false
      setMuted(false)
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  const togglePiP = async () => {
    if (!videoRef.current) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current.requestPictureInPicture()
      }
    } catch (e) {
      console.warn('PiP not supported or failed:', e)
    }
  }

  const handleFavToggle = async () => {
    const next = await toggleFavorite(mediaId)
    setIsFav(next)
  }

  // 6. External subtitle file loader (supports .srt and .vtt directly)
  const handleSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        const cues = parseSubtitleText(text)
        setSubtitleCues(cues)
        setSubtitleStatus(`${file.name} (${cues.length} cues)`)
        setTimeout(() => setSubtitleStatus(null), 3500)
      }
    }
    reader.readAsText(file)

    const url = URL.createObjectURL(file)
    const newSub = { label: file.name, url }
    setExternalSubtitles(prev => [...prev, newSub])
    setSelectedSubtitleTrack(subtitleTracks.length + externalSubtitles.length)
  }

  // Fetch and parse active subtitle track into Cinema Subtitle overlay
  useEffect(() => {
    if (selectedSubtitleTrack === -1) {
      setSubtitleCues([])
      setActiveSubtitleText(null)
      return
    }

    // 1. Embedded MKV Subtitle Track
    if (selectedSubtitleTrack < subtitleTracks.length) {
      if (!isTg) {
        setSubtitleCues([])
        return
      }
      const sub = subtitleTracks[selectedSubtitleTrack]
      setSubtitleLoading(true)
      setSubtitleStatus(`Loading ${sub?.title || 'subtitles'}…`)

      const subStreamIdx = sub?.index !== undefined ? sub.index : selectedSubtitleTrack
      const url = `/api/telegram/subtitles/${mediaId}?track=${selectedSubtitleTrack}&streamIndex=${subStreamIdx}`

      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.text()
        })
        .then(vtt => {
          const cues = parseSubtitleText(vtt)
          setSubtitleCues(cues)
          if (cues.length > 0) {
            setSubtitleStatus(`${sub?.title || 'Subtitles'} active (${cues.length} cues)`)
          } else {
            setSubtitleStatus(`No text cues found for ${sub?.title || 'track'}`)
          }
          setTimeout(() => setSubtitleStatus(null), 3500)
        })
        .catch(err => {
          console.warn('[Subtitles] Fetch error:', err)
          setSubtitleStatus('Subtitles unavailable for this track')
          setTimeout(() => setSubtitleStatus(null), 3500)
        })
        .finally(() => setSubtitleLoading(false))
      return
    }

    // 2. External uploaded subtitle track
    const extIndex = selectedSubtitleTrack - subtitleTracks.length
    const extSub = externalSubtitles[extIndex]
    if (extSub) {
      setSubtitleLoading(true)
      fetch(extSub.url)
        .then(r => r.text())
        .then(raw => {
          const cues = parseSubtitleText(raw)
          setSubtitleCues(cues)
          setSubtitleStatus(`${extSub.label} (${cues.length} cues)`)
          setTimeout(() => setSubtitleStatus(null), 3500)
        })
        .catch(() => {})
        .finally(() => setSubtitleLoading(false))
    }
  }, [selectedSubtitleTrack, subtitleTracks, externalSubtitles, mediaId, isTg])

  // Sync active subtitle cue in real-time (works while playing, paused, or seeking)
  useEffect(() => {
    if (selectedSubtitleTrack === -1 || subtitleCues.length === 0) {
      if (activeSubtitleText !== null) setActiveSubtitleText(null)
      return
    }
    const effectiveTime = currentTime + subtitleDelay
    const match = subtitleCues.find(c => effectiveTime >= c.start && effectiveTime <= c.end)
    const nextText = match ? match.text : null
    if (nextText !== activeSubtitleText) {
      setActiveSubtitleText(nextText)
    }
  }, [currentTime, subtitleDelay, subtitleCues, selectedSubtitleTrack, activeSubtitleText])

  // Sync HTML5 TextTrack mode fallback (if browser supports native cue rendering)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const syncTracks = () => {
      const tracks = v.textTracks
      if (!tracks || tracks.length === 0) return

      for (let i = 0; i < tracks.length; i++) {
        if (selectedSubtitleTrack >= 0) {
          tracks[i].mode = 'showing'
        } else {
          tracks[i].mode = 'disabled'
        }
      }
    }

    syncTracks()
    const timer = setTimeout(syncTracks, 400)
    return () => clearTimeout(timer)
  }, [selectedSubtitleTrack, subtitleTracks, externalSubtitles])

  // Sync HTML5 AudioTrack enabled state (if browser supports audioTracks)
  useEffect(() => {
    const v = videoRef.current as any
    if (!v || !v.audioTracks || v.audioTracks.length === 0) return
    for (let i = 0; i < v.audioTracks.length; i++) {
      v.audioTracks[i].enabled = (i === selectedAudioTrack)
    }
  }, [selectedAudioTrack, audioTracks])

  // 7. Keyboard Shortcuts (Space, Left, Right, Up, Down, M, F, T, P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is focused on an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(currentTime - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(currentTime + 5)
          break
        case 'ArrowUp':
          e.preventDefault()
          handleVolumeChange(volume + 0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          handleVolumeChange(volume - 0.1)
          break
        case 'KeyM':
          e.preventDefault()
          toggleMute()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyT':
          e.preventDefault()
          setTheaterMode(prev => !prev)
          break
        case 'KeyP':
          e.preventDefault()
          togglePiP()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentTime, duration, volume, muted, playing])

  // Resume Handler
  const handleResume = () => {
    if (videoRef.current && resumePos > 0) {
      videoRef.current.currentTime = resumePos
      setCurrentTime(resumePos)
    }
    setShowResume(false)
  }

  const handleStartOver = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      setCurrentTime(0)
    }
    setShowResume(false)
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (bufferedEnd / duration) * 100 : 0

  return (
    <div className={`space-y-4 ${theaterMode ? 'w-full max-w-none' : ''}`}>
      {/* Top Header / Back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-cyan-300 transition"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-2">
          {isTg && (
            <button
              onClick={handleFavToggle}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                isFav
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-400'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Heart size={14} className={isFav ? 'fill-rose-500 text-rose-500' : ''} />
              {isFav ? 'Favorited' : 'Favorite'}
            </button>
          )}

          <Badge tone="cyan">{container}</Badge>
          {fileSize > 0 && <span className="text-xs text-muted-foreground font-mono">{formatBytes(fileSize)}</span>}
        </div>
      </div>

      {/* Main Player Area */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => playing && !settingsOpen && setControlsVisible(false)}
        className={`relative select-none overflow-hidden rounded-2xl border border-border bg-slate-950 transition-all ${
          theaterMode
            ? 'h-[80vh] w-full'
            : 'aspect-video w-full shadow-2xl'
        }`}
      >
        {/* Loading Spinner */}
        {loading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80">
            <div className="size-10 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
            <p className="text-sm font-medium text-cyan-300">Connecting media stream…</p>
            <p className="text-xs text-muted-foreground">Preparing Range pipeline</p>
          </div>
        )}

        {/* Error State */}
        {errorMessage && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
            <p className="text-base font-semibold text-rose-400">Playback Failed</p>
            <p className="text-xs text-muted-foreground max-w-md">{errorMessage}</p>
            <button
              onClick={() => {
                setLoading(true)
                setErrorMessage(null)
                if (videoRef.current) videoRef.current.load()
              }}
              className="mt-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Resume Modal */}
        {showResume && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="rounded-xl border border-border bg-card p-6 text-center shadow-2xl max-w-sm">
              <Clock className="mx-auto mb-2 text-cyan-300" size={28} />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Resume Playback</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                Continue from {formatTime(resumePos)}?
              </h3>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={handleResume}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition"
                >
                  Resume
                </button>
                <button
                  onClick={handleStartOver}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition"
                >
                  Start Over
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HTML5 Video Element */}
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            crossOrigin="anonymous"
            className="h-full w-full object-contain"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration)
                setLoading(false)
              }
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false)
              if (onNavigateNext && hasNext) onNavigateNext()
            }}
            playsInline
          >
            {/* Embedded Subtitle Track (Only active track to avoid concurrent download flood) */}
            {selectedSubtitleTrack >= 0 && selectedSubtitleTrack < subtitleTracks.length && (
              <track
                key={`emb_${selectedSubtitleTrack}`}
                label={subtitleTracks[selectedSubtitleTrack]?.title || 'Subtitles'}
                srcLang={subtitleTracks[selectedSubtitleTrack]?.language || 'en'}
                kind="subtitles"
                src={`/api/telegram/subtitles/${mediaId}?track=${selectedSubtitleTrack}`}
                default
              />
            )}

            {/* External Subtitle Track */}
            {selectedSubtitleTrack >= subtitleTracks.length && externalSubtitles[selectedSubtitleTrack - subtitleTracks.length] && (
              <track
                key={`ext_${selectedSubtitleTrack}`}
                label={externalSubtitles[selectedSubtitleTrack - subtitleTracks.length].label}
                kind="subtitles"
                src={externalSubtitles[selectedSubtitleTrack - subtitleTracks.length].url}
                default
              />
            )}
          </video>
        )}

        {/* Big Center Play/Pause button on hover/pause */}
        {(!playing || controlsVisible) && !loading && !errorMessage && !showResume && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto size-16 flex items-center justify-center rounded-full bg-cyan-400/90 text-slate-950 shadow-xl backdrop-blur transition-transform hover:scale-110 active:scale-95 z-10"
          >
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
          </button>
        )}

        {/* Cinema Subtitle Display Overlay (Rendered directly on top of video, supports line breaks, styling & subtitleDelay) */}
        {activeSubtitleText && selectedSubtitleTrack !== -1 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 transition-all duration-150 ${
              controlsVisible ? 'bottom-20 sm:bottom-24' : 'bottom-8 sm:bottom-12'
            }`}
          >
            <div className="rounded-lg bg-black/85 px-4 py-1.5 text-center text-sm sm:text-base md:text-lg font-medium text-white shadow-2xl backdrop-blur-md [text-shadow:_0_2px_4px_rgb(0_0_0_/_95%)] max-w-2xl leading-relaxed whitespace-pre-line border border-white/15">
              {activeSubtitleText}
            </div>
          </div>
        )}

        {/* Subtitle Status / Cue count / Loading Banner */}
        {subtitleStatus && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-slate-900/90 border border-white/20 px-3.5 py-1 text-xs text-cyan-300 shadow-xl backdrop-blur">
            {subtitleLoading && <div className="size-3 animate-spin rounded-full border border-cyan-400 border-t-transparent" />}
            <span>{subtitleStatus}</span>
          </div>
        )}

        {/* Subtitle Display Overlay if subtitle delay or custom styling is applied */}
        {subtitleDelay !== 0 && selectedSubtitleTrack !== -1 && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-20 rounded bg-black/70 px-3 py-1 text-center text-xs text-amber-300 backdrop-blur border border-amber-400/20 ${
              controlsVisible ? 'bottom-28 sm:bottom-32' : 'bottom-16 sm:bottom-20'
            }`}
          >
            Subtitles Sync: {subtitleDelay > 0 ? `+${subtitleDelay}s` : `${subtitleDelay}s`}
          </div>
        )}

        {/* VLC / Advanced Overlay Controls */}
        <div
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Seek Bar with Buffered Progress */}
          <div className="group/seek relative mb-3 flex h-4 w-full cursor-pointer items-center">
            {/* Background track */}
            <div className="relative h-1.5 w-full rounded-full bg-white/20 transition-all group-hover/seek:h-2.5">
              {/* Buffered buffer bar */}
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-white/30"
                style={{ width: `${bufferedPct}%` }}
              />
              {/* Played progress bar */}
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-cyan-400"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {/* Interactive Range Input overlay */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={e => seek(Number(e.target.value))}
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-white">
            {/* Left Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Prev Video Button */}
              {hasPrev && onNavigatePrev && (
                <button
                  onClick={onNavigatePrev}
                  className="rounded p-1 text-white/80 hover:text-white transition"
                  title="Previous"
                >
                  <SkipBack size={18} />
                </button>
              )}

              {/* Quick Seek -10s */}
              <button
                onClick={() => seek(currentTime - 10)}
                className="flex items-center rounded p-1 text-white/80 hover:text-cyan-300 transition"
                title="Seek -10s"
              >
                <RotateCcw size={16} />
                <span className="text-[10px] ml-0.5 font-mono">10</span>
              </button>

              {/* Play / Pause Toggle */}
              <button
                onClick={togglePlay}
                className="flex size-9 items-center justify-center rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 transition shadow"
              >
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>

              {/* Quick Seek +10s */}
              <button
                onClick={() => seek(currentTime + 10)}
                className="flex items-center rounded p-1 text-white/80 hover:text-cyan-300 transition"
                title="Seek +10s"
              >
                <RotateCw size={16} />
                <span className="text-[10px] ml-0.5 font-mono">10</span>
              </button>

              {/* Next Video Button */}
              {hasNext && onNavigateNext && (
                <button
                  onClick={onNavigateNext}
                  className="rounded p-1 text-white/80 hover:text-white transition"
                  title="Next"
                >
                  <SkipForward size={18} />
                </button>
              )}

              {/* Volume Slider & Mute */}
              <div className="flex items-center gap-2 pl-1">
                <button onClick={toggleMute} className="text-white/80 hover:text-white">
                  {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={e => handleVolumeChange(Number(e.target.value))}
                  className="w-16 h-1 accent-cyan-400 cursor-pointer hidden sm:block"
                />
              </div>

              {/* Time Display */}
              <div className="font-mono text-xs text-white/80 pl-2">
                <span>{formatTime(currentTime)}</span>
                <span className="text-white/40 mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Speed Quick Toggle */}
              <button
                onClick={() => {
                  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
                  const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
                  changeSpeed(next)
                }}
                className="rounded border border-white/20 px-2 py-0.5 text-xs font-mono text-white/90 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                {speed}×
              </button>

              {/* VLC Settings Menu Trigger */}
              <div className="relative">
                <button
                  onClick={() => {
                    setSettingsOpen(!settingsOpen)
                    setMenuPage('main')
                  }}
                  className={`rounded p-1.5 transition ${
                    settingsOpen ? 'bg-cyan-400 text-slate-950' : 'text-white/80 hover:text-white'
                  }`}
                  title="Audio, Subtitles & Playback Settings"
                >
                  <SettingsIcon size={18} />
                </button>

                {/* Nested VLC Settings Popup Menu */}
                {settingsOpen && (
                  <div className="absolute bottom-11 right-0 w-64 rounded-xl border border-border bg-slate-900/95 p-3 text-sm text-foreground shadow-2xl backdrop-blur-md z-50">
                    {/* Menu Header with Back button if in submenu */}
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2">
                      {menuPage !== 'main' ? (
                        <button
                          onClick={() => setMenuPage('main')}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-300"
                        >
                          <ChevronLeft size={14} /> Back
                        </button>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</span>
                      )}
                      <button onClick={() => setSettingsOpen(false)} className="text-muted-foreground hover:text-foreground">
                        <X size={14} />
                      </button>
                    </div>

                    {/* Main Menu */}
                    {menuPage === 'main' && (
                      <div className="space-y-1">
                        <button
                          onClick={() => setMenuPage('speed')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span>Playback Speed</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {speed}× <ChevronRight size={14} />
                          </span>
                        </button>

                        <button
                          onClick={() => setMenuPage('audio')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2">
                            <Headphones size={14} /> Audio Track
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {audioTracks.length > 0
                              ? (audioTracks[selectedAudioTrack]?.title || audioTracks[selectedAudioTrack]?.language?.toUpperCase() || `Track ${selectedAudioTrack + 1} (${audioTracks.length})`)
                              : 'Default'}
                            <ChevronRight size={14} />
                          </span>
                        </button>

                        <button
                          onClick={() => setMenuPage('subtitles')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span className="flex items-center gap-2">
                            <SubtitlesIcon size={14} /> Subtitles
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {selectedSubtitleTrack === -1
                              ? 'Off'
                              : selectedSubtitleTrack < subtitleTracks.length
                              ? (subtitleTracks[selectedSubtitleTrack]?.title || subtitleTracks[selectedSubtitleTrack]?.language?.toUpperCase() || `Track ${selectedSubtitleTrack + 1}`)
                              : (externalSubtitles[selectedSubtitleTrack - subtitleTracks.length]?.label || 'Active')}
                            <ChevronRight size={14} />
                          </span>
                        </button>

                        <button
                          onClick={() => setMenuPage('subDelay')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span>Subtitle Delay</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {subtitleDelay}s <ChevronRight size={14} />
                          </span>
                        </button>

                        <button
                          onClick={() => setMenuPage('audioDelay')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span>Audio Delay</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {audioDelay}s <ChevronRight size={14} />
                          </span>
                        </button>

                        <button
                          onClick={() => setMenuPage('quality')}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span>Quality</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {videoTracks[0]?.height ? `${videoTracks[0].height}p` : 'Original'}
                            <ChevronRight size={14} />
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Speed Submenu */}
                    {menuPage === 'speed' && (
                      <div className="space-y-1">
                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(s => (
                          <button
                            key={s}
                            onClick={() => {
                              changeSpeed(s)
                              setMenuPage('main')
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                          >
                            <span>{s}×</span>
                            {speed === s && <Check size={14} className="text-cyan-300" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Audio Track Submenu */}
                    {menuPage === 'audio' && (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {audioTracks.length === 0 ? (
                          <div className="px-2.5 py-2 text-xs text-muted-foreground">
                            Default stereo stream (Single track)
                          </div>
                        ) : (
                          audioTracks.map((tr, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedAudioTrack(i)
                                setMenuPage('main')
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10 text-left"
                            >
                              <div>
                                <p className="font-medium text-foreground">{tr.title || `Track ${i + 1}`}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {tr.language ? tr.language.toUpperCase() : 'UND'} • {tr.codec}
                                </p>
                              </div>
                              {selectedAudioTrack === i && <Check size={14} className="text-cyan-300 shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {/* Subtitles Submenu */}
                    {menuPage === 'subtitles' && (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        <button
                          onClick={() => {
                            setSelectedSubtitleTrack(-1)
                            setMenuPage('main')
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                        >
                          <span>Off</span>
                          {selectedSubtitleTrack === -1 && <Check size={14} className="text-cyan-300" />}
                        </button>

                        {subtitleTracks.map((sub, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setSelectedSubtitleTrack(i)
                              setMenuPage('main')
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10 text-left"
                          >
                            <div>
                              <p className="font-medium text-foreground">{sub.title || `Subtitle ${i + 1}`}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {sub.language ? sub.language.toUpperCase() : 'Embedded'} • {sub.codec}
                              </p>
                            </div>
                            {selectedSubtitleTrack === i && (
                              subtitleLoading ? (
                                <div className="size-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent shrink-0" />
                              ) : (
                                <Check size={14} className="text-cyan-300 shrink-0" />
                              )
                            )}
                          </button>
                        ))}

                        {/* External Subtitle Files */}
                        {externalSubtitles.map((sub, i) => (
                          <button
                            key={'ext_' + i}
                            onClick={() => {
                              setSelectedSubtitleTrack(subtitleTracks.length + i)
                              setMenuPage('main')
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10 text-left"
                          >
                            <div>
                              <p className="font-medium text-cyan-300">{sub.label}</p>
                              <p className="text-[10px] text-muted-foreground">External file</p>
                            </div>
                            {selectedSubtitleTrack === subtitleTracks.length + i && (
                              subtitleLoading ? (
                                <div className="size-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent shrink-0" />
                              ) : (
                                <Check size={14} className="text-cyan-300 shrink-0" />
                              )
                            )}
                          </button>
                        ))}

                        <div className="pt-2 border-t border-border/40">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".srt,.vtt"
                            onChange={handleSubtitleUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
                          >
                            <Upload size={13} /> Load Subtitle File (.srt / .vtt)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Subtitle Delay Submenu */}
                    {menuPage === 'subDelay' && (
                      <div className="space-y-1">
                        {[-5, -2, -1, 0, 1, 2, 5].map(d => (
                          <button
                            key={d}
                            onClick={() => {
                              setSubtitleDelay(d)
                              setMenuPage('main')
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                          >
                            <span>{d === 0 ? '0s (No delay)' : d > 0 ? `+${d}s` : `${d}s`}</span>
                            {subtitleDelay === d && <Check size={14} className="text-cyan-300" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Audio Delay Submenu */}
                    {menuPage === 'audioDelay' && (
                      <div className="space-y-1">
                        {[-5, -2, -1, 0, 1, 2, 5].map(d => (
                          <button
                            key={d}
                            onClick={() => {
                              setAudioDelay(d)
                              setMenuPage('main')
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/10"
                          >
                            <span>{d === 0 ? '0s (No delay)' : d > 0 ? `+${d}s` : `${d}s`}</span>
                            {audioDelay === d && <Check size={14} className="text-cyan-300" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quality Submenu */}
                    {menuPage === 'quality' && (
                      <div className="space-y-1">
                        <div className="rounded-lg bg-white/5 p-2 text-xs">
                          <p className="font-semibold text-cyan-300">
                            {videoTracks[0]?.width && videoTracks[0]?.height
                              ? `${videoTracks[0].width} × ${videoTracks[0].height}`
                              : 'Original Stream'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Codec: {videoTracks[0]?.codec || 'Direct'}{' '}
                            {videoTracks[0]?.fps ? `• ${videoTracks[0].fps} FPS` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Theater Mode Toggle */}
              <button
                onClick={() => setTheaterMode(!theaterMode)}
                className={`rounded p-1 text-white/80 hover:text-white transition ${theaterMode ? 'text-cyan-300' : ''}`}
                title="Theater mode (T)"
              >
                <MonitorPlay size={18} />
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="rounded p-1 text-white/80 hover:text-white transition"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Media Information Card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="cyan">{subTitle}</Badge>
              {isTg && <Badge>{item.data.chatTitle}</Badge>}
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Container: <span className="text-foreground font-medium">{container}</span>
              {videoTracks[0] && (
                <> • Video: <span className="text-foreground">{videoTracks[0].codec} ({videoTracks[0].width}×{videoTracks[0].height})</span></>
              )}
              {audioTracks.length > 0 && (
                <> • Audio: <span className="text-foreground">{audioTracks.length} tracks</span></>
              )}
              {subtitleTracks.length > 0 && (
                <> • Subtitles: <span className="text-foreground">{subtitleTracks.length} tracks</span></>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            {hasPrev && onNavigatePrev && (
              <button
                onClick={onNavigatePrev}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition"
              >
                Previous
              </button>
            )}
            {hasNext && onNavigateNext && (
              <button
                onClick={onNavigateNext}
                className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
