'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, Play, Pause, Volume2, VolumeX, Maximize, Check, SkipBack, SkipForward, FileText, X, Clock } from 'lucide-react'
import { Badge, ProgressBar, formatTime } from './shared'
import { useVideoPlayer } from '@/hooks/useVideoPlayer'
import { useProgress } from '@/hooks/useProgress'
import { useNotes } from '@/hooks/useNotes'
import { useCourseData } from '@/hooks/useCourseData'
import { useSettings } from '@/hooks/useSettings'
import type { CourseItem, LectureProgress } from '@/lib/types'

const COMPLETION_THRESHOLD = 0.92  // 92% = auto-complete

export function Player({
  lecture,
  onBack,
  onNavigate,
}: {
  lecture: CourseItem
  onBack: () => void
  onNavigate: (l: CourseItem) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showResume, setShowResume] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [hasAutoCompleted, setHasAutoCompleted] = useState(false)

  const { playerState, videoSrc, errorMessage, prepare } = useVideoPlayer()
  const { progress, save, saveImmediate, complete } = useProgress(lecture)
  const { notes, saveNote, deleteNote } = useNotes(lecture.id)
  const { allLectures } = useCourseData()
  const { settings } = useSettings()

  // Find prev/next
  const idx = allLectures.findIndex(l => l.id === lecture.id)
  const prevLecture = idx > 0 ? allLectures[idx - 1] : null
  const nextLecture = idx >= 0 && idx < allLectures.length - 1 ? allLectures[idx + 1] : null

  // Prepare video source
  useEffect(() => {
    prepare(lecture)
  }, [lecture.id])

  // Show resume dialog once progress is loaded and video is ready
  useEffect(() => {
    if (playerState === 'ready' && progress && progress.currentPosition > 10 && !progress.completed) {
      setShowResume(true)
    }
  }, [playerState, progress?.lectureId])

  // Apply playback speed
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = settings.defaultPlaybackSpeed
    setSpeed(settings.defaultPlaybackSpeed)
  }, [settings.defaultPlaybackSpeed])

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const ct = v.currentTime
    const dur = v.duration || 0
    setCurrentTime(ct)
    setDuration(dur)
    save(ct, dur)

    // Auto-complete at threshold
    if (!hasAutoCompleted && dur > 0 && ct / dur >= COMPLETION_THRESHOLD) {
      setHasAutoCompleted(true)
      complete()
    }
  }, [save, complete, hasAutoCompleted])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration)
  }, [])

  const handlePause = useCallback(() => {
    setPlaying(false)
    const v = videoRef.current
    if (v) saveImmediate(v.currentTime, v.duration || 0)
  }, [saveImmediate])

  const handlePlay = useCallback(() => setPlaying(true), [])

  const handleEnded = useCallback(() => {
    setPlaying(false)
    complete()
    if (settings.autoplayNext && nextLecture) {
      setTimeout(() => onNavigate(nextLecture), 1500)
    }
  }, [complete, settings.autoplayNext, nextLecture, onNavigate])

  // Visibility change — save on tab hide
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && videoRef.current) {
        saveImmediate(videoRef.current.currentTime, videoRef.current.duration || 0)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [saveImmediate])

  // Controls
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play() } else { v.pause() }
  }

  const seek = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = seconds
  }

  const handleSeekBar = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value))
  }

  const cycleSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) document.exitFullscreen()
      else videoRef.current.requestFullscreen()
    }
  }

  const handleResume = () => {
    if (videoRef.current && progress) {
      videoRef.current.currentTime = progress.currentPosition
    }
    setShowResume(false)
  }

  const handleStartOver = () => {
    if (videoRef.current) videoRef.current.currentTime = 0
    setShowResume(false)
  }

  const handleAddNote = async () => {
    if (!noteContent.trim()) return
    await saveNote(noteContent.trim(), Math.floor(currentTime))
    setNoteContent('')
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="rotate-180" size={16} />
        Back to dashboard
      </button>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        {/* Video Area */}
        <div>
          <div className="relative flex aspect-video items-center justify-center rounded-xl border border-border bg-[#080d12] overflow-hidden">
            {/* Resume Dialog */}
            {showResume && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                <div className="rounded-xl border border-border bg-card p-6 text-center shadow-xl">
                  <p className="mb-1 text-sm text-muted-foreground">Continue from where you left off?</p>
                  <p className="mb-5 text-xl font-semibold">Resume from {formatTime(progress?.currentPosition ?? 0)}</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={handleResume} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Resume</button>
                    <button onClick={handleStartOver} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">Start Over</button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {playerState === 'preparing' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
                <p className="text-sm text-muted-foreground">
                  {lecture.sourceArchive ? 'Extracting video from archive…' : 'Loading video…'}
                </p>
              </div>
            )}

            {/* Error state */}
            {playerState === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80">
                <p className="text-sm text-destructive">Video failed to load</p>
                <p className="text-xs text-muted-foreground">{errorMessage}</p>
                <button onClick={() => prepare(lecture)} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">Retry</button>
              </div>
            )}

            {/* Auto-complete banner */}
            {hasAutoCompleted && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-950">
                <Check size={14} />
                Lecture completed!
                {nextLecture && settings.autoplayNext && <span className="text-xs ml-1">Next up: {nextLecture.title}</span>}
              </div>
            )}

            {videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                className="absolute inset-0 h-full w-full"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onPause={handlePause}
                onPlay={handlePlay}
                onEnded={handleEnded}
                playsInline
              />
            )}

            {/* Controls overlay — shown when not playing or on hover */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8">
              {/* Seek bar */}
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                step={0.5}
                onChange={handleSeekBar}
                className="w-full h-1 accent-cyan-400 mb-2 cursor-pointer"
              />
              <div className="flex items-center justify-between text-xs text-white/80">
                <div className="flex items-center gap-3">
                  <button onClick={() => seek(Math.max(0, currentTime - 10))} className="hover:text-white"><SkipBack size={14} /></button>
                  <button onClick={togglePlay} className="flex size-8 items-center justify-center rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                    {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  </button>
                  <button onClick={() => seek(Math.min(duration, currentTime + 10))} className="hover:text-white"><SkipForward size={14} /></button>
                  <button onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted }} className="hover:text-white">
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={cycleSpeed} className="text-xs hover:text-white">{speed}×</button>
                  <button onClick={toggleFullscreen} className="hover:text-white"><Maximize size={14} /></button>
                </div>
              </div>
            </div>
          </div>

          {/* Lecture Info + Actions */}
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex gap-2">
                <Badge tone="cyan">{lecture.folderPath[0] ?? 'Course'}</Badge>
                {lecture.folderPath[1] && <Badge>{lecture.folderPath[1]}</Badge>}
              </div>
              <h1 className="text-2xl font-semibold">{lecture.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{lecture.originalFilename}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => prevLecture && onNavigate(prevLecture)}
                disabled={!prevLecture}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={complete}
                className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Mark Complete
              </button>
              <button
                onClick={() => nextLecture && onNavigate(nextLecture)}
                disabled={!nextLecture}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          {/* Notes Section */}
          <div className="mt-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Notes</p>
              <button onClick={() => setShowNotes(!showNotes)} className="text-xs text-muted-foreground hover:text-foreground">
                {showNotes ? 'Hide' : `Show (${notes.length})`}
              </button>
            </div>
            {showNotes && (
              <div className="p-4 space-y-3">
                {/* Add note */}
                <div className="flex gap-2">
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder={`Add a note at ${formatTime(currentTime)}…`}
                    className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-cyan-400"
                    rows={2}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteContent.trim()}
                    className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40 self-start"
                  >
                    Save
                  </button>
                </div>
                {/* Notes list */}
                {notes.map(note => (
                  <div key={note.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{note.content}</p>
                      <button onClick={() => deleteNote(note.id)} className="shrink-0 text-muted-foreground hover:text-foreground"><X size={14} /></button>
                    </div>
                    {note.videoTimestamp !== null && (
                      <button
                        onClick={() => seek(note.videoTimestamp!)}
                        className="mt-1 flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                      >
                        <Clock size={11} />
                        {formatTime(note.videoTimestamp)}
                      </button>
                    )}
                  </div>
                ))}
                {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet. Pause the video and write one above.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Curriculum Sidebar */}
        <aside className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Curriculum</p>
            <p className="mt-1 font-semibold">{lecture.folderPath[0] ?? 'Course'}</p>
          </div>
          <div className="p-4 space-y-0.5 max-h-[600px] overflow-y-auto">
            {allLectures.map(l => (
              <button
                key={l.id}
                onClick={() => onNavigate(l)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-3 text-left ${l.id === lecture.id ? 'bg-cyan-400/10 text-cyan-200' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <span className="text-xs font-mono shrink-0">
                  {l.id === lecture.id ? <Play size={12} fill="currentColor" /> : l.originalFilename.match(/^(\d+)/)?.[1] ?? '·'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{l.title}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
