'use client'

import { useState } from 'react'
import { Search, FileText, Clock, X, Trash2 } from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { useCourseData } from '@/hooks/useCourseData'
import { formatTime } from './shared'
import type { CourseItem } from '@/lib/types'

export function NotesPage({ onPlay }: { onPlay: (l: CourseItem) => void }) {
  const { notes, isLoading, deleteNote, searchNotes, reload } = useNotes()
  const { allLectures } = useCourseData()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<typeof notes | null>(null)

  const lectureMap = new Map(allLectures.map(l => [l.id, l]))

  const displayed = searchResults ?? notes

  const handleSearch = async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setSearchResults(null); return }
    const results = await searchNotes(q)
    setSearchResults(results)
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">MLTrack library</p>
        <h1 className="text-3xl font-semibold">Notes</h1>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Search size={16} />
          <input
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            placeholder="Search notes…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
          />
          {query && (
            <button onClick={() => { setQuery(''); setSearchResults(null) }}><X size={14} /></button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">{query ? 'No notes match your search.' : 'No notes yet.'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Open a lecture and add notes while watching.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {displayed.map(note => {
            const lecture = lectureMap.get(note.lectureId)
            return (
              <div key={note.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText size={13} className="text-cyan-300" />
                    {lecture?.title ?? 'Unknown lecture'}
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="mt-2 text-sm">{note.content}</p>
                <div className="mt-3 flex items-center justify-between">
                  {note.videoTimestamp !== null && lecture ? (
                    <button
                      onClick={() => onPlay(lecture)}
                      className="flex items-center gap-1 text-xs text-cyan-300 hover:underline"
                    >
                      <Clock size={11} />
                      {formatTime(note.videoTimestamp)}
                    </button>
                  ) : <span />}
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
