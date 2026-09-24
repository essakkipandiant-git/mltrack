'use client'

import { FileText } from 'lucide-react'
import { useCourseData } from '@/hooks/useCourseData'

export function SelfStudyPage() {
  const { course } = useCourseData()
  const sections = [
    ...(course?.selfStudy ?? []),
    ...(course?.days.flatMap(d => d.selfStudySections) ?? []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">MLTrack library</p>
        <h1 className="text-3xl font-semibold">Self Study</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Self-study sections have no recorded lectures — they represent independent study time.
      </p>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No self-study sections detected in your course.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map(ss => (
            <div key={ss.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{ss.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ss.isEmpty ? 'No recorded lectures in this section. This is intentional.' : `${ss.resources.length} resources`}
                  </p>
                  {ss.resources.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {ss.resources.map(r => (
                        <li key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText size={12} />
                          {r.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
