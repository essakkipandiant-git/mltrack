import type { DayAssignmentConfidence } from '@/lib/types'

export type DetectionResult =
  | { type: 'DAY'; dayNumbers: number[]; confidence: DayAssignmentConfidence; label: string }
  | { type: 'MENTORING'; label: string }
  | { type: 'SELF_STUDY'; label: string }
  | { type: 'UNKNOWN'; label: string }

/**
 * Detect what a file/folder/archive name represents.
 *
 * Handles:
 *   Day-1.zip          → DAY [1]   CERTAIN
 *   DAY-12.zip         → DAY [12]  CERTAIN
 *   day 13.zip         → DAY [13]  CERTAIN
 *   Day-8+9+10+11.zip  → DAY [8,9,10,11]  UNCERTAIN (multiple days)
 *   DAY-16+17.zip      → DAY [16,17]       UNCERTAIN
 *   Mentoring.zip      → MENTORING
 *   Self Study/        → SELF_STUDY
 */
export function detectArchiveType(name: string): DetectionResult {
  const base = stripExtension(name)

  // ── Mentoring ───────────────────────────────────────────────────────────────
  if (/mentor(ing|ship)?/i.test(base)) {
    return { type: 'MENTORING', label: base }
  }

  // ── Self Study ──────────────────────────────────────────────────────────────
  if (/self[\s_-]?study/i.test(base)) {
    return { type: 'SELF_STUDY', label: base }
  }

  // ── Combined days: Day-8+9+10+11 or DAY-16+17 ──────────────────────────────
  const combinedMatch = base.match(/day[\s_-]*(\d+(?:[+&,]\d+)+)/i)
  if (combinedMatch) {
    const dayNumbers = combinedMatch[1]
      .split(/[+&,]/)
      .map(n => parseInt(n, 10))
      .filter(n => !isNaN(n))

    if (dayNumbers.length > 0) {
      const label = dayNumbers.length === 1
        ? `DAY ${String(dayNumbers[0]).padStart(2, '0')}`
        : `DAYS ${String(dayNumbers[0]).padStart(2, '0')}–${String(dayNumbers[dayNumbers.length - 1]).padStart(2, '0')}`
      return {
        type: 'DAY',
        dayNumbers,
        confidence: 'UNCERTAIN',  // multiple days → uncertain until internal structure confirms
        label,
      }
    }
  }

  // ── Single day: Day-1, DAY-12, day 13, Day_14 ──────────────────────────────
  const singleMatch = base.match(/day[\s_-]*(\d+)/i)
  if (singleMatch) {
    const n = parseInt(singleMatch[1], 10)
    if (!isNaN(n)) {
      return {
        type: 'DAY',
        dayNumbers: [n],
        confidence: 'CERTAIN',
        label: `DAY ${String(n).padStart(2, '0')}`,
      }
    }
  }

  return { type: 'UNKNOWN', label: base }
}

/**
 * Detect what an *internal* folder inside a ZIP represents.
 * Used to verify multi-day archive contents.
 */
export function detectInternalFolder(folderName: string): DetectionResult {
  // Check for self-study
  if (/self[\s_-]?study/i.test(folderName)) {
    return { type: 'SELF_STUDY', label: folderName }
  }

  // Check for day indicator
  const singleMatch = folderName.match(/day\s*(\d+)/i)
  if (singleMatch) {
    const n = parseInt(singleMatch[1], 10)
    if (!isNaN(n)) {
      return {
        type: 'DAY',
        dayNumbers: [n],
        confidence: 'CERTAIN',
        label: `DAY ${String(n).padStart(2, '0')}`,
      }
    }
  }

  return { type: 'UNKNOWN', label: folderName }
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** Format day label from numbers */
export function formatDayLabel(dayNumbers: number[]): string {
  if (dayNumbers.length === 0) return 'Unknown'
  if (dayNumbers.length === 1) return `DAY ${String(dayNumbers[0]).padStart(2, '0')}`
  const sorted = [...dayNumbers].sort((a, b) => a - b)
  return `DAYS ${String(sorted[0]).padStart(2, '0')}–${String(sorted[sorted.length - 1]).padStart(2, '0')}`
}
