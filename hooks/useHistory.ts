'use client'

import { useState, useEffect, useCallback } from 'react'
import { getWatchHistory, clearHistory as clearHistoryStorage } from '@/lib/storage/history'
import type { WatchHistoryEntry } from '@/lib/types'

export function useHistory(limit?: number) {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await getWatchHistory()
      setHistory(limit ? all.slice(0, limit) : all)
    } catch {
      setHistory([])
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  useEffect(() => { reload() }, [reload])

  const clearHistory = useCallback(async () => {
    await clearHistoryStorage()
    setHistory([])
  }, [])

  return { history, isLoading, reload, clearHistory }
}
