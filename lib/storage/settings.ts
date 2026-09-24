import { getDB } from './db'
import type { AppSettings } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/types'

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]
  const settings = { ...DEFAULT_SETTINGS }

  for (const key of keys) {
    const record = await db.get('settings', key)
    if (record !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(settings as any)[key] = record.value
    }
  }

  return settings
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('settings', 'readwrite')

  for (const [key, value] of Object.entries(settings)) {
    await tx.store.put({ key, value })
  }

  await tx.done
}
