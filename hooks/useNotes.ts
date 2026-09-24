'use client'

import { useState, useEffect, useCallback } from 'react'
import { getNotes, saveNote as saveNoteStorage, deleteNote as deleteNoteStorage, searchNotes as searchNotesStorage } from '@/lib/storage/notes'
import type { Note } from '@/lib/types'

export function useNotes(lectureId?: string) {
  const [notes, setNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await getNotes(lectureId)
      setNotes(loaded)
    } finally {
      setIsLoading(false)
    }
  }, [lectureId])

  useEffect(() => { reload() }, [reload])

  const saveNote = useCallback(async (
    content: string,
    videoTimestamp: number | null = null,
    existingId?: string
  ): Promise<Note> => {
    const note = await saveNoteStorage({
      id: existingId,
      lectureId: lectureId ?? '',
      content,
      videoTimestamp,
    })
    await reload()
    return note
  }, [lectureId, reload])

  const deleteNote = useCallback(async (id: string) => {
    await deleteNoteStorage(id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [])

  const searchNotes = useCallback(async (query: string): Promise<Note[]> => {
    return searchNotesStorage(query)
  }, [])

  return { notes, isLoading, saveNote, deleteNote, searchNotes, reload }
}
