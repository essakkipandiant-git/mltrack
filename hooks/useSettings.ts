'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSettings, saveSettings as saveSettingsStorage } from '@/lib/storage/settings'
import type { AppSettings } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s)
      setIsLoading(false)
    })
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await saveSettingsStorage(patch)
  }, [settings])

  return { settings, isLoading, updateSettings }
}
