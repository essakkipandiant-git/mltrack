import { getDB } from './db'
import type { ManualAssignment } from '@/lib/types'

export async function getManualAssignments(): Promise<ManualAssignment[]> {
  const db = await getDB()
  return db.getAll('manualAssignments')
}

export async function getAssignment(itemId: string): Promise<ManualAssignment | null> {
  const db = await getDB()
  return (await db.get('manualAssignments', itemId)) ?? null
}

export async function saveManualAssignment(assignment: ManualAssignment): Promise<void> {
  const db = await getDB()
  await db.put('manualAssignments', assignment)
}

export async function deleteManualAssignment(itemId: string): Promise<void> {
  const db = await getDB()
  await db.delete('manualAssignments', itemId)
}

export async function bulkSaveManualAssignments(assignments: ManualAssignment[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('manualAssignments', 'readwrite')
  for (const a of assignments) {
    await tx.store.put(a)
  }
  await tx.done
}
