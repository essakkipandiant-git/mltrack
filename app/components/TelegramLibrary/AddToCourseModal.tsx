'use client'

import React, { useState } from 'react'
import { FolderPlus, X, Check, BookOpen } from 'lucide-react'
import { useCourseData } from '@/hooks/useCourseData'
import { getCachedCourse, saveCourseCache } from '@/lib/storage/courseCache'
import type { TelegramMedia, CourseItem, DayGroup } from '@/lib/types'

interface AddToCourseModalProps {
  media: TelegramMedia
  onClose: () => void
  onSuccess: () => void
}

export function AddToCourseModal({ media, onClose, onSuccess }: AddToCourseModalProps) {
  const { course, reload } = useCourseData()
  const days: DayGroup[] = course?.days || []
  const [selectedDayId, setSelectedDayId] = useState<string>(days[0]?.id || '')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    if (!selectedDayId) return
    setSaving(true)

    try {
      const cached = await getCachedCourse()
      if (cached) {
        const targetDay = cached.days.find((d: DayGroup) => d.id === selectedDayId)
        if (targetDay) {
          const newItem: CourseItem = {
            id: media.id,
            type: 'VIDEO',
            title: media.filename.replace(/\.[^/.]+$/, ''),
            originalFilename: media.filename,
            sourceArchive: null,
            sourcePath: `telegram://${media.chatId}/${media.telegramMessageId}`,
            folderPath: [targetDay.label, 'Telegram Media'],
            duration: media.duration,
            sizeBytes: media.fileSize,
          }

          if (!targetDay.lectures.some((l: CourseItem) => l.id === newItem.id)) {
            targetDay.lectures.push(newItem)
            await saveCourseCache(cached)
            reload()
          }
        }
      }
      onSuccess()
      onClose()
    } catch (e) {
      console.error('Failed to add to course:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
              <FolderPlus size={16} />
            </div>
            <h2 className="font-semibold text-foreground">Add to Course Day</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Selected File</p>
            <p className="text-sm font-medium text-foreground truncate mt-0.5">{media.filename}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Choose Course Day</label>
            <select
              value={selectedDayId}
              onChange={e => setSelectedDayId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-400"
            >
              {days.map((d: DayGroup) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({d.lectures.length} lectures)
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !selectedDayId}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition shadow"
            >
              {saving ? 'Adding…' : 'Attach to Day'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
