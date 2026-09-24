'use client'

import { Check, Play, Clock3, BookOpen, Flame } from 'lucide-react'
import { ProgressBar, Badge, Stat, LectureRow, formatTime } from './shared'
import { useCourseData } from '@/hooks/useCourseData'
import { useProgress } from '@/hooks/useProgress'
import { useHistory } from '@/hooks/useHistory'
import { useSettings } from '@/hooks/useSettings'
import type { CourseItem, LectureProgress } from '@/lib/types'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function Dashboard({ onPlay, setPage }: { onPlay: (l: CourseItem) => void; setPage: (p: string) => void }) {
  const { allLectures, course } = useCourseData()
  const { history } = useHistory(5)
  const { settings } = useSettings()
  const { allProgress } = useProgress(null)

  // Build a progress map
  const progressMap = new Map<string, LectureProgress>(allProgress.map(p => [p.lectureId, p]))

  // Compute stats
  const completed = allProgress.filter(p => p.completed).length
  const inProgress = allProgress.filter(p => !p.completed && p.percentage > 0).length
  const remaining = Math.max(0, allLectures.length - completed)
  const totalWatchSeconds = allProgress.reduce((acc, p) => acc + (p.currentPosition ?? 0), 0)
  const watchTime = formatWatchTime(totalWatchSeconds)

  // Current in-progress lecture
  const currentLecture = allLectures.find(l => {
    const p = progressMap.get(l.id)
    return p && !p.completed && p.percentage > 0
  }) ?? null

  const currentProgress = currentLecture ? progressMap.get(currentLecture.id) ?? null : null

  // Today's plan
  const target = settings.dailyLectureTarget
  const completedToday = allProgress.filter(p => {
    if (!p.completed || !p.lastWatched) return false
    const d = new Date(p.lastWatched)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length
  const todayPlanLectures = buildTodayPlan(allLectures, progressMap, target)

  // Recent history items as CourseItem lookups
  const recentItems = history
    .slice(0, 4)
    .map(h => allLectures.find(l => l.id === h.lectureId))
    .filter(Boolean) as CourseItem[]

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <p className="mb-1 text-sm text-muted-foreground">{formatDate()}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{getGreeting()}, Essakki</h1>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-0 rounded-xl border border-border bg-card py-5 md:grid-cols-5">
        <Stat icon={Check} value={String(completed)} label="Completed" />
        <Stat icon={Play} value={String(inProgress)} label="In progress" />
        <Stat icon={BookOpen} value={String(remaining)} label="Remaining" />
        <Stat icon={Clock3} value={watchTime} label="Watch time" />
        <Stat icon={Flame} value="—" label="Current streak" accent />
      </div>

      {/* Continue Learning + Today's Plan */}
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        {/* Continue Learning Card */}
        <section className="overflow-hidden rounded-xl border border-cyan-400/30 bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Continue learning</p>
              <h2 className="mt-1 text-xl font-semibold">
                {currentLecture?.title ?? 'No lecture in progress'}
              </h2>
            </div>
            {currentLecture && (
              <Badge tone="cyan">
                {currentLecture.folderPath[0] ?? ''} · {currentLecture.title.slice(0, 20)}
              </Badge>
            )}
          </div>
          <div className="bg-[#101923] p-5">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-[#0b1118]">
              <div
                className="absolute inset-0 opacity-30"
                style={{ backgroundImage: 'linear-gradient(135deg, transparent 0 48%, rgba(56,189,248,.25) 49% 50%, transparent 51%), linear-gradient(45deg, transparent 0 48%, rgba(56,189,248,.14) 49% 50%, transparent 51%)', backgroundSize: '34px 34px' }}
              />
              {currentLecture ? (
                <button
                  onClick={() => onPlay(currentLecture)}
                  className="relative flex size-14 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:scale-105"
                >
                  <Play size={22} fill="currentColor" />
                </button>
              ) : (
                <p className="relative text-sm text-muted-foreground">
                  {allLectures.length === 0
                    ? 'No course imported yet. Go to Import / Library.'
                    : 'All lectures completed or not started.'}
                </p>
              )}
              {currentProgress && currentProgress.duration > 0 && (
                <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white">
                  {formatTime(currentProgress.currentPosition)} / {formatTime(currentProgress.duration)}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                {currentProgress && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Resume from {formatTime(currentProgress.currentPosition)}
                    </p>
                    <div className="mt-2 w-48">
                      <ProgressBar value={currentProgress.percentage} />
                    </div>
                  </>
                )}
              </div>
              {currentLecture && (
                <button
                  onClick={() => onPlay(currentLecture)}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Continue Learning
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Today's Plan */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today&apos;s learning</p>
              <h2 className="mt-1 text-lg font-semibold">Your plan</h2>
            </div>
            <button onClick={() => setPage('Progress')} className="text-xs text-cyan-300 hover:underline">
              {target} lectures
            </button>
          </div>
          <div className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold">{completedToday} of {target}</p>
                <p className="text-xs text-muted-foreground">lectures completed today</p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-full border-4 border-cyan-400/20 border-t-cyan-400 text-xs font-semibold">
                {target > 0 ? Math.round((completedToday / target) * 100) : 0}%
              </div>
            </div>
            <div className="space-y-3">
              {todayPlanLectures.map((item) => {
                const p = progressMap.get(item.lecture.id)
                const s = p?.completed ? 'completed' : (p?.percentage ?? 0) > 0 ? 'current' : 'upcoming'
                return (
                  <button
                    key={item.lecture.id}
                    onClick={() => s !== 'upcoming' && onPlay(item.lecture)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className={`flex size-6 items-center justify-center rounded-full border ${
                      s === 'completed' ? 'border-emerald-400 bg-emerald-400 text-slate-950' :
                      s === 'current'   ? 'border-cyan-400 text-cyan-300' :
                      'border-border text-muted-foreground'
                    }`}>
                      {s === 'completed' ? <Check size={13} /> : s === 'current' ? <Play size={11} fill="currentColor" /> : <span className="size-1.5 rounded-full bg-muted-foreground" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.lecture.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.lecture.folderPath[0] ?? ''}</span>
                    </span>
                  </button>
                )
              })}
              {todayPlanLectures.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {allLectures.length === 0 ? 'Import a course to get started.' : 'Daily plan target met! 🎉'}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Recently Watched */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recently watched</p>
            <h2 className="mt-1 text-lg font-semibold">Pick up where you left off</h2>
          </div>
          <button onClick={() => setPage('History')} className="text-xs text-cyan-300 hover:underline">View history</button>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {recentItems.length > 0
            ? recentItems.map(l => (
                <LectureRow
                  key={l.id}
                  lecture={l}
                  progress={progressMap.get(l.id)}
                  onPlay={onPlay}
                />
              ))
            : <p className="col-span-2 text-sm text-muted-foreground">No lectures watched yet.</p>
          }
        </div>
      </section>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWatchTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function buildTodayPlan(
  lectures: CourseItem[],
  progressMap: Map<string, LectureProgress>,
  target: number
): { lecture: CourseItem }[] {
  const result: { lecture: CourseItem }[] = []
  for (const lecture of lectures) {
    if (result.length >= target) break
    const p = progressMap.get(lecture.id)
    if (!p || !p.completed) {
      result.push({ lecture })
    }
  }
  return result
}
