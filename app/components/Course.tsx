'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, FileText } from 'lucide-react'
import { ProgressBar, Badge, LectureRow } from './shared'
import { useCourseData } from '@/hooks/useCourseData'
import { useProgress } from '@/hooks/useProgress'
import type { CourseItem, DayGroup, LectureProgress } from '@/lib/types'

export function Course({ onPlay }: { onPlay: (l: CourseItem) => void }) {
  const { course, isLoading, error, allLectures } = useCourseData()
  const { allProgress } = useProgress(null)
  const [open, setOpen] = useState<string[]>([])

  const progressMap = new Map<string, LectureProgress>(allProgress.map(p => [p.lectureId, p]))

  const completedCount = allProgress.filter(p => p.completed).length
  const overallPct = allLectures.length > 0 ? Math.round((completedCount / allLectures.length) * 100) : 0

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Your curriculum</p>
          <h1 className="text-3xl font-semibold">AI/ML Master Course</h1>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-8 text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
          Loading course data…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Your curriculum</p>
          <h1 className="text-3xl font-semibold">AI/ML Master Course</h1>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-card p-6 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!course || course.days.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Your curriculum</p>
          <h1 className="text-3xl font-semibold">AI/ML Master Course</h1>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No course imported yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Go to <strong>Import / Library</strong> to scan your course folder.</p>
        </div>
      </div>
    )
  }

  const totalLectures = allLectures.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Your curriculum</p>
          <h1 className="text-3xl font-semibold">AI/ML Master Course</h1>
        </div>
        <div className="flex gap-2">
          <Badge>Total · {totalLectures} lectures</Badge>
          <Badge tone="green">{completedCount} completed</Badge>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium">Overall course progress</span>
          <span className="font-mono text-cyan-300">{overallPct}%</span>
        </div>
        <ProgressBar value={overallPct} />
      </div>

      <div className="space-y-3">
        {course.days.map(day => {
          const isOpen = open.includes(day.id)
          const dayLectures = [
            ...day.lectures,
            ...day.subFolders.flatMap(f => f.items),
          ].filter(i => i.type === 'VIDEO')
          const dayCompleted = dayLectures.filter(l => progressMap.get(l.id)?.completed).length
          const dayPct = dayLectures.length > 0 ? Math.round((dayCompleted / dayLectures.length) * 100) : 0

          return (
            <DaySection
              key={day.id}
              day={day}
              isOpen={isOpen}
              pct={dayPct}
              progressMap={progressMap}
              onToggle={() => setOpen(isOpen ? open.filter(x => x !== day.id) : [...open, day.id])}
              onPlay={onPlay}
            />
          )
        })}
      </div>
    </div>
  )
}

function DaySection({ day, isOpen, pct, progressMap, onToggle, onPlay }: {
  day: DayGroup
  isOpen: boolean
  pct: number
  progressMap: Map<string, LectureProgress>
  onToggle: () => void
  onPlay: (l: CourseItem) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-muted/30"
      >
        <span className="text-muted-foreground">
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
        <span className="font-mono text-sm font-semibold tracking-wide">{day.label}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{day.sourceArchive}</span>
        {day.assignmentConfidence === 'UNCERTAIN' && (
          <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">Manual assignment needed</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden w-24 sm:block"><ProgressBar value={pct} /></span>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border px-5 pb-4">
          {/* Self-study sections */}
          {day.selfStudySections.map(ss => (
            <div key={ss.id} className="border-b border-border/60 py-3">
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <FolderOpen size={14} />
                Self Study — {ss.name}
              </div>
              {ss.isEmpty && (
                <p className="mt-1 text-xs text-muted-foreground pl-5">No recorded lectures in this section. This is intentional.</p>
              )}
            </div>
          ))}

          {/* Sub-folders with their lectures */}
          {day.subFolders.map(folder => (
            <div key={folder.name}>
              <div className="flex items-center gap-2 border-b border-border/60 py-3 text-xs text-cyan-300">
                <FolderOpen size={14} />
                {folder.name}
              </div>
              {folder.items.map(l => (
                <LectureRow key={l.id} lecture={l} progress={progressMap.get(l.id)} onPlay={onPlay} />
              ))}
            </div>
          ))}

          {/* Direct lectures (no sub-folder) */}
          {day.lectures.filter(l => l.type === 'VIDEO').map(l => (
            <LectureRow key={l.id} lecture={l} progress={progressMap.get(l.id)} onPlay={onPlay} />
          ))}

          {/* Resources */}
          {day.resources.map(r => (
            <div key={r.id} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0 text-sm text-muted-foreground">
              <FileText size={14} className="text-cyan-300/60" />
              <span>{r.title}</span>
              <Badge>PDF</Badge>
            </div>
          ))}

          {/* Empty fallback */}
          {day.lectures.length === 0 && day.subFolders.length === 0 && day.selfStudySections.length === 0 && (
            <div className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
              <FolderOpen size={16} />
              No lectures detected in this day.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
