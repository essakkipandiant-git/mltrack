'use client'

import { useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { clearHistory } from '@/lib/storage/history'
import { clearAllProgress } from '@/lib/storage/progress'
import { clearCourseCache } from '@/lib/storage/courseCache'
import type { AppSettings } from '@/lib/types'

export function SettingsPage({ onCourseReset }: { onCourseReset: () => void }) {
  const { settings, updateSettings } = useSettings()
  const [courseRoot, setCourseRoot] = useState('')
  const [savingPath, setSavingPath] = useState(false)
  const [pathMsg, setPathMsg] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState<'history' | 'progress' | 'cache' | 'all' | null>(null)

  // Load current path
  useState(() => {
    fetch('/api/config').then(r => r.json()).then((d: { courseRoot: string }) => setCourseRoot(d.courseRoot ?? '')).catch(() => {})
  })

  const savePath = async () => {
    setSavingPath(true)
    setPathMsg(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseRoot }),
      })
      const d = await res.json() as { ok?: boolean; error?: string }
      setPathMsg(d.error ? `Error: ${d.error}` : 'Saved ✓')
    } catch (e) {
      setPathMsg(`Error: ${(e as Error).message}`)
    } finally {
      setSavingPath(false)
    }
  }

  const handleDangerAction = async (action: 'history' | 'progress' | 'cache' | 'all') => {
    if (action === 'history' || action === 'all') await clearHistory()
    if (action === 'progress' || action === 'all') await clearAllProgress()
    if (action === 'cache' || action === 'all') {
      await clearCourseCache()
      onCourseReset()
    }
    setConfirmClear(null)
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">MLTrack configuration</p>
        <h1 className="text-3xl font-semibold">Settings</h1>
      </div>

      {/* Course Library */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Course Library</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configure your local AI_ML_COURSE folder path.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={courseRoot}
              onChange={e => setCourseRoot(e.target.value)}
              placeholder="C:\Users\...\AI_ML_COURSE"
              className="flex-1 min-w-64 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono outline-none focus:border-cyan-400"
            />
            <button
              onClick={savePath}
              disabled={savingPath}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {savingPath ? 'Saving…' : 'Save'}
            </button>
          </div>
          {pathMsg && <p className={`text-xs ${pathMsg.startsWith('Error') ? 'text-destructive' : 'text-emerald-400'}`}>{pathMsg}</p>}
        </div>
      </section>

      {/* Playback Settings */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Playback</h2>
        </div>
        <div className="divide-y divide-border/60">
          <SettingRow label="Daily lecture target" description="How many lectures to aim for per day">
            <input
              type="number"
              min={1}
              max={20}
              value={settings.dailyLectureTarget}
              onChange={e => updateSettings({ dailyLectureTarget: parseInt(e.target.value, 10) })}
              className="w-20 rounded border border-border bg-muted px-2 py-1 text-center text-sm outline-none focus:border-cyan-400"
            />
          </SettingRow>
          <SettingRow label="Default playback speed" description="Starting speed for all lectures">
            <select
              value={settings.defaultPlaybackSpeed}
              onChange={e => updateSettings({ defaultPlaybackSpeed: parseFloat(e.target.value) })}
              className="rounded border border-border bg-muted px-2 py-1 text-sm outline-none focus:border-cyan-400"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </SettingRow>
          <SettingRow label="Autoplay next lecture" description="Automatically start next lecture when one finishes">
            <Toggle value={settings.autoplayNext} onChange={v => updateSettings({ autoplayNext: v })} />
          </SettingRow>
          <SettingRow label="Remember playback position" description="Resume from where you left off">
            <Toggle value={settings.rememberPosition} onChange={v => updateSettings({ rememberPosition: v })} />
          </SettingRow>
          <SettingRow label="Separate mentoring progress" description="Mentoring sessions tracked independently from main course">
            <Toggle value={settings.separateMentoringProgress} onChange={v => updateSettings({ separateMentoringProgress: v })} />
          </SettingRow>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-xl border border-destructive/30 bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-destructive">Danger Zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">These actions cannot be undone.</p>
        </div>
        <div className="divide-y divide-border/60">
          <DangerRow
            label="Clear Course Cache"
            description="Clear cached course structure and rescan on next load. Progress, notes, and history are preserved."
            action="Clear Cache"
            confirm={confirmClear === 'cache'}
            onRequest={() => setConfirmClear('cache')}
            onConfirm={() => handleDangerAction('cache')}
            onCancel={() => setConfirmClear(null)}
          />
          <DangerRow
            label="Clear Watch History"
            description="Remove all history entries. Progress is preserved."
            action="Clear History"
            confirm={confirmClear === 'history'}
            onRequest={() => setConfirmClear('history')}
            onConfirm={() => handleDangerAction('history')}
            onCancel={() => setConfirmClear(null)}
          />
          <DangerRow
            label="Reset Progress"
            description="Reset all watch positions and completion status."
            action="Reset Progress"
            confirm={confirmClear === 'progress'}
            onRequest={() => setConfirmClear('progress')}
            onConfirm={() => handleDangerAction('progress')}
            onCancel={() => setConfirmClear(null)}
          />
          <DangerRow
            label="Reset Everything"
            description="Clear history, progress, and course cache. A full rescan will be required."
            action="Reset All"
            confirm={confirmClear === 'all'}
            onRequest={() => setConfirmClear('all')}
            onConfirm={() => handleDangerAction('all')}
            onCancel={() => setConfirmClear(null)}
            destructive
          />
        </div>
      </section>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-cyan-400' : 'bg-muted'}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function DangerRow({ label, description, action, confirm, onRequest, onConfirm, onCancel, destructive }: {
  label: string; description: string; action: string
  confirm: boolean; onRequest: () => void; onConfirm: () => void; onCancel: () => void
  destructive?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <button onClick={onConfirm} className="rounded-lg bg-destructive px-3 py-1.5 text-sm text-white">Confirm</button>
          <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
        </div>
      ) : (
        <button
          onClick={onRequest}
          className={`rounded-lg border px-3 py-1.5 text-sm ${destructive ? 'border-destructive/50 text-destructive hover:bg-destructive/10' : 'border-border hover:bg-muted'}`}
        >
          {action}
        </button>
      )}
    </div>
  )
}
