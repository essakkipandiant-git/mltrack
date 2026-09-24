'use client'

import { Check, Play, FileText, FolderOpen } from 'lucide-react'
import type { CourseItem, LectureProgress } from '@/lib/types'

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'amber' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${tone === 'amber' ? 'bg-amber-400' : 'bg-cyan-400'}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'green' | 'cyan' | 'amber' }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium ${
      tone === 'green'  ? 'bg-emerald-400/10 text-emerald-300' :
      tone === 'cyan'   ? 'bg-cyan-400/10 text-cyan-300' :
      tone === 'amber'  ? 'bg-amber-400/10 text-amber-300' :
      'bg-muted text-muted-foreground'
    }`}>
      {children}
    </span>
  )
}

// ─── Stat ────────────────────────────────────────────────────────────────────

export function Stat({ icon: Icon, value, label, accent }: {
  icon: React.ElementType
  value: string
  label: string
  accent?: boolean
}) {
  return (
    <div className="border-l border-border px-5 first:border-0">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className={accent ? 'text-amber-300' : 'text-cyan-300'} size={16} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="font-mono text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

// ─── LectureRow ───────────────────────────────────────────────────────────────

export function LectureRow({
  lecture,
  progress,
  onPlay,
  showDay = false,
}: {
  lecture: CourseItem
  progress?: LectureProgress | null
  onPlay: (l: CourseItem) => void
  showDay?: boolean
}) {
  const pct = progress?.percentage ?? 0
  const completed = progress?.completed ?? false
  const durationLabel = lecture.duration ? formatDuration(lecture.duration) : '—'
  const folder = lecture.folderPath[lecture.folderPath.length - 1]

  return (
    <div className="group flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-mono text-muted-foreground">
        {completed ? <Check className="text-emerald-400" size={13} /> : lecture.originalFilename.match(/^(\d+)/)?.[1] ?? '·'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{lecture.title}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {durationLabel}
          {folder && ` · ${folder}`}
          {showDay && lecture.folderPath[0] && ` · ${lecture.folderPath[0]}`}
        </p>
      </div>
      {pct > 0 && (
        <div className="hidden w-28 items-center gap-2 sm:flex">
          <ProgressBar value={pct} />
          <span className="w-8 text-right text-[10px] text-muted-foreground">{pct}%</span>
        </div>
      )}
      <button
        aria-label={`Play ${lecture.title}`}
        onClick={() => onPlay(lecture)}
        className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-cyan-400 hover:text-cyan-300"
      >
        <Play size={13} fill="currentColor" />
      </button>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatTime(seconds: number): string {
  return formatDuration(seconds)
}
