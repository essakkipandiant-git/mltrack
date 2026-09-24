'use client'

import React, { useState, useEffect, useCallback, useTransition } from 'react'
import {
  Search, Send, RefreshCw, Filter, Film, Play, Heart,
  SlidersHorizontal, Check, Info, HardDrive, Clock, Headphones,
  Subtitles, AlertCircle, Plus, FolderPlus, ListPlus, LogOut, CheckCircle2
} from 'lucide-react'
import { Badge, formatTime } from '../shared'
import { TelegramConnectModal } from './TelegramConnectModal'
import { MediaDetailsModal } from './MediaDetailsModal'
import { AddToCourseModal } from './AddToCourseModal'
import { AddToPlaylistModal } from './AddToPlaylistModal'
import { getFavorites, toggleFavorite } from '@/lib/storage/favorites'
import type { TelegramChat, TelegramMedia, TelegramScanStatus, TelegramAuthStatus } from '@/lib/types'

interface TelegramLibraryProps {
  onPlayMedia: (media: TelegramMedia) => void
}

type FilterType = 'all' | 'videos' | 'mkv' | 'mp4' | 'audio' | 'documents' | 'favorites'
type SortType = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest'

export function TelegramLibrary({ onPlayMedia }: TelegramLibraryProps) {
  // Auth state
  const [authStatus, setAuthStatus] = useState<TelegramAuthStatus>({ connected: false })
  const [showConnectModal, setShowConnectModal] = useState(false)

  // Media & Query state
  const [items, setItems] = useState<TelegramMedia[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ totalMedia: number; totalVideos: number; totalMkv: number; totalMp4: number }>({
    totalMedia: 0,
    totalVideos: 0,
    totalMkv: 0,
    totalMp4: 0,
  })
  const [chats, setChats] = useState<TelegramChat[]>([])
  const [favorites, setFavorites] = useState<string[]>([])

  // Search & Filter controls
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [selectedChatId, setSelectedChatId] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [page, setPage] = useState(1)

  // Scan & Progress state
  const [scanStatus, setScanStatus] = useState<TelegramScanStatus>({ status: 'idle', indexedCount: 0 })
  const [indexing, setIndexing] = useState(false)

  // Modals state
  const [detailsMedia, setDetailsMedia] = useState<TelegramMedia | null>(null)
  const [courseMedia, setCourseMedia] = useState<TelegramMedia | null>(null)
  const [playlistMedia, setPlaylistMedia] = useState<TelegramMedia | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // 1. Check Auth & Load Initial Data
  const loadAuthAndChats = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/status')
      const data: TelegramAuthStatus = await res.json()
      setAuthStatus(data)

      if (data.connected) {
        const chatsRes = await fetch('/api/telegram/chats')
        const chatsData = await chatsRes.json()
        if (chatsData.chats) setChats(chatsData.chats)
      }
    } catch (e) {
      console.error('Error loading Telegram status:', e)
    }
  }, [])

  const loadFavorites = useCallback(async () => {
    const favs = await getFavorites()
    setFavorites(favs)
  }, [])

  useEffect(() => {
    loadAuthAndChats()
    loadFavorites()
  }, [loadAuthAndChats, loadFavorites])

  // 2. Fetch Media items based on search, filter, chat, sort
  const fetchMedia = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (activeFilter !== 'all') params.set('filter', activeFilter)
      if (selectedChatId !== 'all') params.set('chatId', selectedChatId)
      params.set('sort', sortBy)
      params.set('page', String(page))
      params.set('limit', '36')
      if (favorites.length > 0) params.set('favorites', favorites.join(','))

      const res = await fetch(`/api/telegram/media?${params.toString()}`)
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
        setTotal(data.total)
        if (data.stats) setStats(data.stats)
      }
    } catch (e) {
      console.error('Error querying Telegram media:', e)
    }
  }, [searchQuery, activeFilter, selectedChatId, sortBy, page, favorites])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  // 3. Scan status polling when indexing
  useEffect(() => {
    let timer: NodeJS.Timeout
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/telegram/index')
        const status: TelegramScanStatus = await res.json()
        setScanStatus(status)
        if (status.status === 'scanning') {
          setIndexing(true)
          timer = setTimeout(checkStatus, 1500)
        } else {
          setIndexing(false)
          fetchMedia()
        }
      } catch {}
    }

    checkStatus()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [indexing, fetchMedia])

  // 4. Trigger Indexing
  const handleStartScan = async (full = false) => {
    if (indexing) return
    setIndexing(true)
    try {
      await fetch('/api/telegram/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullRescan: full }),
      })
    } catch (e) {
      console.error('Failed to trigger scan:', e)
      setIndexing(false)
    }
  }

  // 5. Disconnect Telegram
  const handleLogout = async () => {
    if (!confirm('Are you sure you want to disconnect your Telegram account?')) return
    try {
      await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      setAuthStatus({ connected: false })
      setItems([])
      setChats([])
    } catch {}
  }

  // 6. Favorite toggle
  const handleToggleFav = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = await toggleFavorite(id)
    if (next) {
      setFavorites(prev => [...prev, id])
    } else {
      setFavorites(prev => prev.filter(f => f !== id))
    }
  }

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 size={16} />
          {toastMsg}
        </div>
      )}

      {/* Top Header & Connection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Telegram Library</h1>
            <Badge tone="cyan">MKV / Network Player</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Search and stream video files directly from your connected Telegram chats with VLC-style controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {authStatus.connected ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  {authStatus.user?.firstName || 'Connected'}
                </span>
                <span className="text-muted-foreground text-[11px] font-mono">
                  {authStatus.user?.username ? `@${authStatus.user.username}` : authStatus.user?.phone || 'Telegram Account'}
                </span>
              </div>

              <button
                onClick={() => handleStartScan(false)}
                disabled={indexing}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition shadow"
              >
                <RefreshCw size={13} className={indexing ? 'animate-spin' : ''} />
                {indexing ? 'Scanning…' : 'Scan Telegram'}
              </button>

              <button
                onClick={handleLogout}
                title="Disconnect Telegram"
                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition shadow"
            >
              <Send size={14} /> Connect Telegram Account
            </button>
          )}
        </div>
      </div>

      {/* Indexing Progress Banner if currently scanning */}
      {indexing && (
        <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/5 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-cyan-300 flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin text-cyan-400" />
              Scanning Telegram Chats…
            </span>
            <span className="font-mono text-muted-foreground">
              {scanStatus.indexedCount} media items discovered
            </span>
          </div>
          {scanStatus.currentChatTitle && (
            <p className="text-[11px] text-muted-foreground">
              Currently indexing: <span className="text-foreground font-medium">{scanStatus.currentChatTitle}</span>
            </p>
          )}
          <div className="h-1.5 w-full rounded-full bg-cyan-400/20 overflow-hidden">
            <div className="h-full bg-cyan-400 animate-pulse w-2/3" />
          </div>
        </div>
      )}

      {/* Main Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
          placeholder="Search Telegram files by filename, chat name, extension (e.g. react, mkv, lecture)..."
          className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter and Sorting Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Format / Type Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All', count: stats.totalMedia },
              { id: 'videos', label: 'Videos', count: stats.totalVideos },
              { id: 'mkv', label: 'MKV', count: stats.totalMkv },
              { id: 'mp4', label: 'MP4', count: stats.totalMp4 },
              { id: 'audio', label: 'Audio' },
              { id: 'documents', label: 'Documents' },
              { id: 'favorites', label: 'Favorites', count: favorites.length },
            ] as { id: FilterType; label: string; count?: number }[]
          ).map(f => (
            <button
              key={f.id}
              onClick={() => { setActiveFilter(f.id); setPage(1) }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeFilter === f.id
                  ? 'bg-cyan-400 text-slate-950 font-semibold shadow'
                  : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.id === 'favorites' && <Heart size={12} className={activeFilter === 'favorites' ? 'fill-slate-950' : 'text-rose-400'} />}
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className={`text-[10px] ml-0.5 px-1 rounded-full ${activeFilter === f.id ? 'bg-slate-950/20 text-slate-950' : 'bg-muted text-muted-foreground'}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Chat Filter & Sorting Dropdowns */}
        <div className="flex items-center gap-2">
          {/* Chat selector */}
          <select
            value={selectedChatId}
            onChange={e => { setSelectedChatId(e.target.value); setPage(1) }}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan-400"
          >
            <option value="all">All Chats ({chats.length})</option>
            {chats.map(c => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortType)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-cyan-400"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="largest">Largest First</option>
            <option value="smallest">Smallest First</option>
          </select>
        </div>
      </div>

      {/* Media Results Count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <span className="text-foreground font-semibold">{items.length}</span> of {total} files
        </span>
        {scanStatus.lastIndexedAt && (
          <span className="text-[11px]">
            Last indexed: {new Date(scanStatus.lastIndexedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Media Grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(media => {
            const isFav = favorites.includes(media.id)
            const isMkv = media.container.toLowerCase() === 'mkv'

            return (
              <div
                key={media.id}
                onClick={() => setDetailsMedia(media)}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 hover:border-cyan-400/60 hover:shadow-lg transition cursor-pointer"
              >
                <div>
                  {/* Card Thumbnail / Preview Banner */}
                  <div className="relative aspect-video w-full rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center border border-border/40 mb-3">
                    <Film size={28} className="text-slate-600 group-hover:text-cyan-400 transition" />

                    {/* Container Badge */}
                    <span className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${
                      isMkv ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-white'
                    }`}>
                      {media.container.toUpperCase()}
                    </span>

                    {/* Duration Badge */}
                    {media.duration && media.duration > 0 && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-mono text-white/90">
                        {formatTime(media.duration)}
                      </span>
                    )}

                    {/* Quick Play overlay button */}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        onPlayMedia(media)
                      }}
                      className="absolute inset-0 m-auto size-10 flex items-center justify-center rounded-full bg-cyan-400 text-slate-950 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                      title="Play Now"
                    >
                      <Play size={16} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>

                  {/* Title & Chat */}
                  <h3 className="text-xs font-semibold text-foreground line-clamp-2 leading-relaxed" title={media.filename}>
                    {media.filename}
                  </h3>

                  <p className="mt-1 text-[11px] text-muted-foreground truncate" title={media.chatTitle}>
                    {media.chatTitle}
                  </p>
                </div>

                {/* Card Footer: Metadata & Actions */}
                <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-foreground font-medium">{formatBytes(media.fileSize)}</span>
                    {media.audioTracks && media.audioTracks.length > 1 && (
                      <span className="rounded bg-muted px-1 text-[10px]" title={`${media.audioTracks.length} Audio Tracks`}>
                        {media.audioTracks.length} A
                      </span>
                    )}
                    {media.subtitleTracks && media.subtitleTracks.length > 0 && (
                      <span className="rounded bg-muted px-1 text-[10px]" title={`${media.subtitleTracks.length} Subtitles`}>
                        {media.subtitleTracks.length} S
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => handleToggleFav(media.id, e)}
                      className={`p-1.5 rounded-md hover:bg-muted transition ${isFav ? 'text-rose-500' : 'text-muted-foreground hover:text-foreground'}`}
                      title={isFav ? 'Remove favorite' : 'Add favorite'}
                    >
                      <Heart size={14} className={isFav ? 'fill-rose-500' : ''} />
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation()
                        onPlayMedia(media)
                      }}
                      className="rounded-md bg-cyan-400/10 px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-400 hover:text-slate-950 transition"
                    >
                      Play
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Film size={40} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold text-foreground">No media files found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {!authStatus.connected
              ? 'Connect your Telegram account to discover and stream MKV, MP4, and media files from your chats.'
              : 'Try searching with a different term, or click Scan Telegram to discover media from your channels and groups.'}
          </p>

          <div className="mt-5 flex justify-center gap-3">
            {!authStatus.connected ? (
              <button
                onClick={() => setShowConnectModal(true)}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition"
              >
                Connect Telegram Account
              </button>
            ) : (
              <button
                onClick={() => handleStartScan(false)}
                disabled={indexing}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition"
              >
                {indexing ? 'Scanning…' : 'Scan Telegram Chats'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showConnectModal && (
        <TelegramConnectModal
          onClose={() => setShowConnectModal(false)}
          onSuccess={st => {
            setAuthStatus(st)
            loadAuthAndChats()
            showToast('Telegram account connected successfully!')
          }}
        />
      )}

      {detailsMedia && (
        <MediaDetailsModal
          media={detailsMedia}
          onClose={() => setDetailsMedia(null)}
          onPlay={m => onPlayMedia(m)}
          onAddToCourse={m => setCourseMedia(m)}
          onAddToPlaylist={m => setPlaylistMedia(m)}
        />
      )}

      {courseMedia && (
        <AddToCourseModal
          media={courseMedia}
          onClose={() => setCourseMedia(null)}
          onSuccess={() => showToast('Linked video to Course Day!')}
        />
      )}

      {playlistMedia && (
        <AddToPlaylistModal
          media={playlistMedia}
          onClose={() => setPlaylistMedia(null)}
          onSuccess={() => showToast('Added to Playlist!')}
        />
      )}
    </div>
  )
}
