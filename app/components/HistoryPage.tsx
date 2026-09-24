'use client'

import { Play, Clock, Check } from 'lucide-react'
import { ProgressBar } from './shared'
import { useHistory } from '@/hooks/useHistory'
import { useCourseData } from '@/hooks/useCourseData'
import type { CourseItem } from '@/lib/types'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 2) return 'Just now'
  if (h < 1) return `${m}m ago`
  if (d < 1) return `${h}h ago`
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export function HistoryPage({ onPlay }: { onPlay: (l: CourseItem) => void }) {
  const { history, isLoading, clearHistory } = useHistory()
  const { allLectures } = useCourseData()

  const lectureMap = new Map(allLectures.map(l => [l.id, l]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">MLTrack library</p>
          <h1 className="text-3xl font-semibold">History</h1>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => { if (confirm('Clear all watch history?')) clearHistory() }}
            className="rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            Clear History
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : history.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No watch history yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Start watching a lecture to see your history here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map(entry => {
            const lecture = lectureMap.get(entry.lectureId)
            return (
              <div key={entry.lectureId} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                  {entry.percentage >= 100 ? <Check size={20} className="text-emerald-400" /> : <Play size={18} fill="currentColor" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{entry.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.dayLabel}</p>
                  <div className="mt-2 w-48">
                    <ProgressBar value={entry.percentage} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(entry.watchedAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.percentage}%</p>
                </div>
                {lecture && (
                  <button
                    onClick={() => onPlay(lecture)}
                    className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-cyan-400 hover:text-cyan-300"
                  >
                    <Play size={13} fill="currentColor" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
