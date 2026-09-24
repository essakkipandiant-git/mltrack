import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'
import { TelegramClient, helpers } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram/tl'
import type { TelegramAuthStatus } from '@/lib/types'

export function toBigInteger(value: number | string | bigint): any {
  return helpers.returnBigInt(value as any)
}

const CONFIG_FILE = getStorageFilePath('mltrack-telegram.json')

interface TelegramStoredConfig {
  apiId?: number
  apiHash?: string
  sessionString?: string
  phoneCodeHash?: string
  phone?: string
  user?: {
    id: string
    firstName: string
    lastName?: string
    username?: string
    phone?: string
  }
}

let _client: TelegramClient | null = null
let _connectingPromise: Promise<TelegramClient | null> | null = null

export function readTelegramConfig(): TelegramStoredConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      return JSON.parse(raw) as TelegramStoredConfig
    }
  } catch (e) {
    console.error('[Telegram Client] Error reading config:', e)
  }
  return {}
}

export function saveTelegramConfig(update: Partial<TelegramStoredConfig>): TelegramStoredConfig {
  const current = readTelegramConfig()
  const merged = { ...current, ...update }
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8')
  } catch (e) {
    console.error('[Telegram Client] Error saving config:', e)
  }
  return merged
}

export function clearTelegramConfig(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE)
    }
  } catch (e) {
    console.error('[Telegram Client] Error clearing config:', e)
  }
  if (_client) {
    try {
      _client.disconnect()
    } catch {}
    _client = null
  }
}

/**
 * Get or initialize the active TelegramClient singleton.
 */
export async function getTelegramClient(): Promise<TelegramClient | null> {
  if (_client && _client.connected) {
    return _client
  }

  if (_connectingPromise) {
    return _connectingPromise
  }

  const config = readTelegramConfig()
  if (!config.apiId || !config.apiHash || !config.sessionString) {
    return null
  }

  _connectingPromise = (async () => {
    try {
      const session = new StringSession(config.sessionString)
      const client = new TelegramClient(session, config.apiId!, config.apiHash!, {
        connectionRetries: 5,
        useWSS: false,
      })

      await client.connect()

      const me = await client.getMe()
      if (me) {
        _client = client
        return client
      } else {
        return null
      }
    } catch (e) {
      console.error('[Telegram Client] Connection failed:', (e as Error).message)
      return null
    } finally {
      _connectingPromise = null
    }
  })()

  return _connectingPromise
}

/**
 * Returns safe public auth status (no secrets exposed)
 */
export async function getTelegramAuthStatus(): Promise<TelegramAuthStatus> {
  const config = readTelegramConfig()
  if (!config.apiId || !config.apiHash || !config.sessionString) {
    return { connected: false }
  }

  try {
    const client = await getTelegramClient()
    if (client && client.connected) {
      return {
        connected: true,
        user: config.user,
      }
    }
  } catch {}

  return { connected: false }
}

/**
 * Step 1 of Auth: Send verification code to user's Telegram phone number
 */
export async function sendTelegramCode(
  apiId: number,
  apiHash: string,
  phoneNumber: string
): Promise<{ phoneCodeHash: string }> {
  // Disconnect existing if any
  if (_client) {
    try { await _client.disconnect() } catch {}
    _client = null
  }

  const session = new StringSession('')
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  })

  await client.connect()

  const { phoneCodeHash } = await client.sendCode(
    { apiId, apiHash },
    phoneNumber
  )

  _client = client

  saveTelegramConfig({
    apiId,
    apiHash,
    phone: phoneNumber,
    phoneCodeHash,
  })

  return { phoneCodeHash }
}

/**
 * Step 2 of Auth: Verify code (+ 2FA password if enabled) and complete sign in
 */
export async function signInTelegram(
  phoneCode: string,
  password?: string
): Promise<TelegramAuthStatus> {
  const config = readTelegramConfig()
  if (!config.apiId || !config.apiHash || !config.phone || !config.phoneCodeHash) {
    throw new Error('No pending login request. Please request a verification code first.')
  }

  let client = _client
  if (!client || !client.connected) {
    const session = new StringSession('')
    client = new TelegramClient(session, config.apiId, config.apiHash, {
      connectionRetries: 3,
    })
    await client.connect()
    _client = client
  }

  try {
    await client.signInUser(
      { apiId: config.apiId, apiHash: config.apiHash },
      {
        phoneNumber: config.phone,
        phoneCode: async () => phoneCode,
        password: async () => {
          if (password) return password
          throw new Error('SESSION_PASSWORD_NEEDED')
        },
        onError: (err: any) => {
          throw err
        },
      } as any
    )
  } catch (err: any) {
    const msg = err?.message || ''
    if (msg.includes('SESSION_PASSWORD_NEEDED') || msg.includes('2FA_REQUIRED')) {
      if (!password) {
        let hint = ''
        try {
          const pass = await client.invoke(new Api.account.GetPassword())
          if (pass && (pass as any).hint) {
            hint = ` (Hint: ${(pass as any).hint})`
          }
        } catch {}
        throw new Error(`2FA_REQUIRED: Two-step verification password is required.${hint}`)
      } else {
        // Attempt SRP password sign-in
        try {
          await client.signInWithPassword(
            { apiId: config.apiId, apiHash: config.apiHash },
            {
              password: async () => password,
              onError: (pwErr: any) => {
                throw pwErr
              },
            } as any
          )
        } catch (pwErr: any) {
          throw new Error(pwErr?.message || 'Invalid 2FA password. Please check your password.')
        }
      }
    } else {
      throw err
    }
  }

  const me = await client.getMe() as any
  const sessionString = (client.session as StringSession).save()

  const userInfo = {
    id: String(me.id),
    firstName: me.firstName || 'Telegram User',
    lastName: me.lastName || undefined,
    username: me.username || undefined,
    phone: me.phone || config.phone,
  }

  saveTelegramConfig({
    sessionString,
    user: userInfo,
    phoneCodeHash: undefined,
  })

  return {
    connected: true,
    user: userInfo,
  }
}

/**
 * Alternative sign-in directly using a saved session string
 */
export async function signInWithSessionString(
  apiId: number,
  apiHash: string,
  sessionString: string
): Promise<TelegramAuthStatus> {
  if (_client) {
    try { await _client.disconnect() } catch {}
    _client = null
  }

  const session = new StringSession(sessionString)
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  })
  await client.connect()

  const me = await client.getMe() as any
  if (!me) throw new Error('Invalid session string or unauthorized.')

  const userInfo = {
    id: String(me.id),
    firstName: me.firstName || 'Telegram User',
    lastName: me.lastName || undefined,
    username: me.username || undefined,
    phone: me.phone || undefined,
  }

  saveTelegramConfig({
    apiId,
    apiHash,
    sessionString,
    user: userInfo,
  })

  _client = client

  return {
    connected: true,
    user: userInfo,
  }
}

/**
 * Log out and clear session
 */
export async function logoutTelegram(): Promise<void> {
  clearTelegramConfig()
}
