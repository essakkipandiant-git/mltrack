import { getDB } from './db'
import type { Note } from '@/lib/types'

function generateNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function getNotes(lectureId?: string): Promise<Note[]> {
  const db = await getDB()
  if (lectureId) {
    const notes = await db.getAllFromIndex('notes', 'by_lecture', lectureId)
    return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  const all = await db.getAll('notes')
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Note, 'id' | 'createdAt'>>): Promise<Note> {
  const db = await getDB()
  const now = new Date().toISOString()
  const existing = note.id ? await db.get('notes', note.id) : null
  const saved: Note = {
    id: note.id ?? generateNoteId(),
    lectureId: note.lectureId,
    content: note.content,
    videoTimestamp: note.videoTimestamp ?? null,
    createdAt: existing?.createdAt ?? note.createdAt ?? now,
    updatedAt: now,
  }
  await db.put('notes', saved)
  return saved
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('notes', id)
}

export async function searchNotes(query: string): Promise<Note[]> {
  const all = await getNotes()
  const lower = query.toLowerCase()
  return all.filter(n => n.content.toLowerCase().includes(lower))
}
