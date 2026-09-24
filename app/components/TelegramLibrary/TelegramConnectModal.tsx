'use client'

import React, { useState } from 'react'
import { Send, Key, Lock, Phone, X, Check, AlertCircle, ExternalLink } from 'lucide-react'
import type { TelegramAuthStatus } from '@/lib/types'

interface TelegramConnectModalProps {
  onClose: () => void
  onSuccess: (status: TelegramAuthStatus) => void
}

export function TelegramConnectModal({ onClose, onSuccess }: TelegramConnectModalProps) {
  const [tab, setTab] = useState<'phone' | 'session'>('phone')

  // Phone auth state
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'credentials' | 'code'>('credentials')
  const [needs2fa, setNeeds2fa] = useState(false)

  // Session string auth state
  const [sessionString, setSessionString] = useState('')

  // Loading & error
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-code',
          apiId: parseInt(apiId, 10),
          apiHash,
          phoneNumber,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code')

      setStep('code')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign-in',
          phoneCode,
          password: needs2fa ? password : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.is2fa) {
          setNeeds2fa(true)
          throw new Error('Two-step verification password is required.')
        }
        throw new Error(data.error || 'Failed to sign in')
      }

      onSuccess({ connected: true, user: data.user })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSessionLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign-in-session',
          apiId: parseInt(apiId, 10),
          apiHash,
          sessionString,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid session string')

      onSuccess({ connected: true, user: data.user })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
              <Send size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Connect Telegram</h2>
              <p className="text-xs text-muted-foreground">Access your chats and media library</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="mt-4 flex rounded-lg bg-muted p-1 text-xs">
          <button
            onClick={() => { setTab('phone'); setError(null) }}
            className={`flex-1 rounded-md py-1.5 font-medium transition ${
              tab === 'phone' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Phone Login
          </button>
          <button
            onClick={() => { setTab('session'); setError(null) }}
            className={`flex-1 rounded-md py-1.5 font-medium transition ${
              tab === 'session' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Session String
          </button>
        </div>

        {/* Error notice */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form: Phone Login */}
        {tab === 'phone' && (
          <div className="mt-4 space-y-4">
            {step === 'credentials' ? (
              <form onSubmit={handleSendCode} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">App API ID</label>
                  <input
                    type="number"
                    required
                    value={apiId}
                    onChange={e => setApiId(e.target.value)}
                    placeholder="e.g. 21548796"
                    className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">App API Hash</label>
                  <input
                    type="text"
                    required
                    value={apiHash}
                    onChange={e => setApiHash(e.target.value)}
                    placeholder="e.g. 3a89b...45c"
                    className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone Number (with country code)</label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+1234567890"
                    className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <a
                    href="https://my.telegram.org"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
                  >
                    Get API ID & Hash <ExternalLink size={11} />
                  </a>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
                  >
                    {loading ? 'Sending Code…' : 'Send Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Telegram Verification Code sent to {phoneNumber}
                  </label>
                  <input
                    type="text"
                    required
                    value={phoneCode}
                    onChange={e => setPhoneCode(e.target.value)}
                    placeholder="12345"
                    className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono tracking-widest outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Two-Step Verification (2FA) Password
                    </label>
                    <span className={`text-[10px] ${needs2fa ? 'text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                      {needs2fa ? 'Required for your account' : 'Optional (if enabled)'}
                    </span>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your Telegram 2FA cloud password"
                    className={`mt-1 w-full rounded-lg border bg-muted px-3 py-2 text-xs outline-none ${
                      needs2fa ? 'border-amber-400 focus:border-amber-300' : 'border-border focus:border-cyan-400'
                    }`}
                  />
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setStep('credentials')}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
                  >
                    {loading ? 'Verifying…' : 'Sign In'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Form: Session String Login */}
        {tab === 'session' && (
          <form onSubmit={handleSessionLogin} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">App API ID</label>
              <input
                type="number"
                required
                value={apiId}
                onChange={e => setApiId(e.target.value)}
                placeholder="API ID"
                className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">App API Hash</label>
              <input
                type="text"
                required
                value={apiHash}
                onChange={e => setApiHash(e.target.value)}
                placeholder="API Hash"
                className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Session String (Telethon / GramJS)</label>
              <textarea
                rows={3}
                required
                value={sessionString}
                onChange={e => setSessionString(e.target.value)}
                placeholder="1BVtsOHQBu...="
                className="mt-1 w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
              >
                {loading ? 'Connecting…' : 'Connect Session'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
