'use client'

import { useState, useEffect } from 'react'
import { Upload, FolderOpen, AlertCircle, Check, ChevronDown } from 'lucide-react'
import { Badge } from './shared'
import { saveCourseCache } from '@/lib/storage/courseCache'
import { saveManualAssignment } from '@/lib/storage/assignments'
import type { ScanResult, ScanWarning, CourseItem, ManualAssignment, DayGroup } from '@/lib/types'

export function ImportPage({ onImported }: { onImported: () => void }) {
  const [courseRoot, setCourseRoot] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  // Manual assignments for uncertain items: itemId → dayNumber | null
  const [manualAssignments, setManualAssignments] = useState<Record<string, number | null>>({})

  // Load current config and existing course cache on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((d: { courseRoot?: string }) => {
        if (d?.courseRoot) {
          setCourseRoot(d.courseRoot)
        }
      })
      .catch(() => {})

    fetch('/api/course')
      .then(r => r.json())
      .then((d: { course?: ScanResult }) => {
        if (d?.course && (d.course.days?.length > 0 || d.course.mentoring?.length > 0)) {
          setScanResult(d.course)
        }
      })
      .catch(() => {})
  }, [])

  const handleSavePath = async () => {
    const cleanPath = courseRoot.trim().replace(/^["']|["']$/g, '')
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseRoot: cleanPath }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || data.error) {
        setSaveMsg(`Error: ${data.error}`)
      } else {
        setCourseRoot(cleanPath)
        setSaveMsg('Path saved ✓')
      }
    } catch (e) {
      setSaveMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleScan = async () => {
    const cleanPath = courseRoot.trim().replace(/^["']|["']$/g, '')
    setScanning(true)
    setScanError(null)
    setScanResult(null)
    try {
      // Auto-save path if entered so user doesn't have to click 'Save Path' first
      if (cleanPath) {
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ courseRoot: cleanPath }),
        }).catch(() => {})
      }

      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseRoot: cleanPath }),
      })
      const data = await res.json() as ScanResult & { error?: string }
      if (!res.ok || data.error) {
        setScanError(data.error ?? 'Scan failed')
      } else {
        setScanResult(data)
        // Pre-fill manual assignments for uncertain items
        const init: Record<string, number | null> = {}
        data.days.filter(d => d.assignmentConfidence === 'UNCERTAIN').forEach(d => {
          d.lectures.forEach(l => { init[l.id] = null })
          d.subFolders.forEach(f => f.items.forEach(l => { init[l.id] = null }))
        })
        setManualAssignments(init)
      }
    } catch (e) {
      setScanError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  const handleImport = async () => {
    if (!scanResult) return
    setImporting(true)
    try {
      // Save course metadata to IndexedDB and server cache
      await saveCourseCache(scanResult)
      await fetch('/api/course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanResult),
      }).catch(() => {})

      // Save manual assignments
      const assignments: ManualAssignment[] = Object.entries(manualAssignments).map(([itemId, dayNumber]) => ({
        itemId,
        assignedDayNumber: dayNumber,
        assignedAt: new Date().toISOString(),
      }))
      for (const a of assignments) await saveManualAssignment(a)

      // Also save to server-side assignments file
      if (assignments.length > 0) {
        await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assignments),
        })
      }

      setImported(true)
      onImported()
    } catch (e) {
      setScanError(`Import failed: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  const uncertainDays = scanResult?.days.filter(d => d.assignmentConfidence === 'UNCERTAIN') ?? []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Local course connection</p>
        <h1 className="text-3xl font-semibold">Import / Library</h1>
      </div>

      {/* Course Root Config */}
      <div className="rounded-xl border border-cyan-400/30 bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300 mb-3">Course Library</p>
        <p className="mb-4 text-sm text-muted-foreground">
          Set the path to your AI_ML_COURSE folder on this Windows machine. The path is stored locally and never uploaded anywhere.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={courseRoot}
            onChange={e => setCourseRoot(e.target.value)}
            placeholder="C:\Users\...\AI_ML_COURSE"
            className="flex-1 min-w-64 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono outline-none focus:border-cyan-400"
          />
          <button
            onClick={handleSavePath}
            disabled={saving || !courseRoot.trim()}
            className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Path'}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || !courseRoot.trim()}
            className="flex items-center gap-2 rounded-lg border border-cyan-400/50 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50"
          >
            <Upload size={16} />
            {scanning ? 'Scanning…' : 'Scan Course'}
          </button>
        </div>
        {saveMsg && (
          <p className={`mt-2 text-xs ${saveMsg.startsWith('Error') ? 'text-destructive' : 'text-emerald-400'}`}>{saveMsg}</p>
        )}
        {scanning && (
          <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-cyan-400" />
            Scanning ZIP archives… This may take a moment for large libraries.
          </div>
        )}
        {scanError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            <AlertCircle size={16} />
            {scanError}
          </div>
        )}
      </div>

      {/* Scan Result Preview */}
      {scanResult && (
        <>
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Scan Complete</p>
              <h2 className="mt-1 text-lg font-semibold">Course scan preview</h2>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
              {[
                [String(scanResult.stats.totalArchives), 'day archives'],
                [String(scanResult.stats.mentoringArchives), 'mentoring archives'],
                [String(scanResult.stats.totalVideos), 'videos detected'],
                [String(scanResult.stats.totalPdfs), 'PDF resources'],
              ].map(([n, l]) => (
                <div key={l} className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="font-mono text-2xl font-semibold text-cyan-300">{n}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>

            {/* Warnings */}
            {scanResult.warnings.length > 0 && (
              <div className="border-t border-border">
                <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scan notes & warnings</div>
                <div className="divide-y divide-border/60">
                  {scanResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3 text-sm text-muted-foreground">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${w.level === 'ERROR' ? 'bg-destructive' : w.level === 'WARNING' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                      {w.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Uncertain Day Assignment UI */}
          {uncertainDays.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-card">
              <div className="border-b border-border px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Uncertain Day Assignment</p>
                <h2 className="mt-1 text-lg font-semibold">Manual assignment required</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The following archives contain multiple days but their internal structure doesn&apos;t clearly separate them.
                  Assign each lecture to the correct day before importing.
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {uncertainDays.map(day => (
                  <UncertainDaySection
                    key={day.id}
                    day={day}
                    assignments={manualAssignments}
                    onAssign={(itemId, dayNum) => setManualAssignments(prev => ({ ...prev, [itemId]: dayNum }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Import Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing || imported}
              className="flex items-center gap-2 rounded-lg bg-cyan-400 px-6 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {importing ? 'Importing…' : imported ? <><Check size={16} /> Imported</> : 'Import Detected Structure'}
            </button>
            {imported && (
              <p className="text-sm text-emerald-400">Course imported. Your existing progress is preserved.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function UncertainDaySection({ day, assignments, onAssign }: {
  day: DayGroup
  assignments: Record<string, number | null>
  onAssign: (itemId: string, dayNum: number | null) => void
}) {
  const allItems = [...day.lectures, ...day.subFolders.flatMap(f => f.items)]

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Badge tone="amber">{day.sourceArchive}</Badge>
        <span className="text-sm text-muted-foreground">
          Possible days: {day.dayNumbers.map(n => `Day ${n}`).join(', ')}
        </span>
      </div>
      <div className="space-y-2">
        {allItems.map(item => (
          <div key={item.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
            <select
              value={assignments[item.id] ?? ''}
              onChange={e => onAssign(item.id, e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className="rounded border border-border bg-muted px-2 py-1 text-xs outline-none focus:border-cyan-400"
            >
              <option value="">Unassigned</option>
              {day.dayNumbers.map(n => (
                <option key={n} value={n}>Day {n}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
