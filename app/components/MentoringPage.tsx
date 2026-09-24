'use client'

import { Play } from 'lucide-react'
import { ProgressBar, Badge } from './shared'
import { useCourseData } from '@/hooks/useCourseData'
import { useProgress } from '@/hooks/useProgress'
import type { CourseItem } from '@/lib/types'

export function MentoringPage({ onPlay }: { onPlay: (l: CourseItem) => void }) {
  const { course } = useCourseData()
  const { allProgress } = useProgress(null)

  const progressMap = new Map(allProgress.map(p => [p.lectureId, p]))
  const sessions = course?.mentoring ?? []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">MLTrack library</p>
        <h1 className="text-3xl font-semibold">Mentoring</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Mentoring sessions are tracked separately from the main course progress.
      </p>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No mentoring sessions detected. Scan your course library to find mentoring archives.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map(session => {
            const items = session.items
            const completed = items.filter(i => progressMap.get(i.id)?.completed).length
            const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0

            return (
              <div key={session.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                    <Play size={18} fill="currentColor" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{session.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{items.length} videos · {session.sourceArchive}</p>
                    {items.length > 0 && (
                      <div className="mt-3">
                        <ProgressBar value={pct} />
                      </div>
                    )}
                  </div>
                </div>
                {items.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => onPlay(item)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                      >
                        <Play size={11} className="text-cyan-300" fill="currentColor" />
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
