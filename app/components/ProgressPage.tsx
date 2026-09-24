'use client'

import { ProgressBar, Badge } from './shared'
import { useCourseData } from '@/hooks/useCourseData'
import { useProgress } from '@/hooks/useProgress'
import type { LectureProgress } from '@/lib/types'

export function ProgressPage() {
  const { course, allLectures } = useCourseData()
  const { allProgress } = useProgress(null)

  const progressMap = new Map<string, LectureProgress>(allProgress.map(p => [p.lectureId, p]))

  const completed = allProgress.filter(p => p.completed).length
  const inProgress = allProgress.filter(p => !p.completed && (p.percentage ?? 0) > 0).length
  const notStarted = allLectures.length - completed - inProgress
  const overallPct = allLectures.length > 0 ? Math.round((completed / allLectures.length) * 100) : 0
  const totalSeconds = allProgress.reduce((acc, p) => acc + (p.currentPosition ?? 0), 0)
  const watchHours = (totalSeconds / 3600).toFixed(1)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">MLTrack library</p>
        <h1 className="text-3xl font-semibold">Progress</h1>
      </div>

      {/* Overall Progress */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium">Overall course progress</span>
          <span className="font-mono text-cyan-300">{overallPct}%</span>
        </div>
        <ProgressBar value={overallPct} />
        <div className="mt-5 grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          {[
            [String(completed), 'Completed', 'text-emerald-400'],
            [String(inProgress), 'In Progress', 'text-cyan-300'],
            [String(notStarted), 'Not Started', 'text-muted-foreground'],
            [`${watchHours}h`, 'Watch Time', 'text-muted-foreground'],
          ].map(([v, l, c]) => (
            <div key={l}>
              <p className={`font-mono text-2xl font-semibold ${c}`}>{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-day breakdown */}
      {course && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Day-by-day breakdown</h2>
          {course.days.map(day => {
            const dayLectures = [...day.lectures, ...day.subFolders.flatMap(f => f.items)].filter(l => l.type === 'VIDEO')
            const dayCompleted = dayLectures.filter(l => progressMap.get(l.id)?.completed).length
            const dayPct = dayLectures.length > 0 ? Math.round((dayCompleted / dayLectures.length) * 100) : 0

            return (
              <div key={day.id} className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <span className="font-mono text-sm font-semibold tracking-wide w-20">{day.label}</span>
                <div className="flex-1">
                  <ProgressBar value={dayPct} />
                </div>
                <span className="text-xs text-muted-foreground w-20 text-right">
                  {dayCompleted}/{dayLectures.length} · {dayPct}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!course && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No course imported yet.
        </div>
      )}
    </div>
  )
}
