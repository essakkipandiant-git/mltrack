'use client'

import React, { useState, useEffect } from 'react'
import {
  Play, X, Film, Headphones, Subtitles, Heart, FolderPlus, ListPlus,
  Clock, HardDrive, Monitor, Sparkles
} from 'lucide-react'
import { Badge, formatTime } from '../shared'
import { toggleFavorite, isFavorite } from '@/lib/storage/favorites'
import type { TelegramMedia } from '@/lib/types'

interface MediaDetailsModalProps {
  media: TelegramMedia
  onClose: () => void
  onPlay: (media: TelegramMedia) => void
  onAddToCourse?: (media: TelegramMedia) => void
  onAddToPlaylist?: (media: TelegramMedia) => void
}

export function MediaDetailsModal({
  media,
  onClose,
  onPlay,
  onAddToCourse,
  onAddToPlaylist,
}: MediaDetailsModalProps) {
  const [item, setItem] = useState<TelegramMedia>(media)
  const [probing, setProbing] = useState(false)
  const [fav, setFav] = useState(false)

  useEffect(() => {
    isFavorite(media.id).then(setFav).catch(() => setFav(false))

    // Probe tracks via API if not yet analyzed
    if (!item.audioTracks || item.audioTracks.length === 0) {
      setProbing(true)
      fetch(`/api/telegram/media/${media.id}`, { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.item) setItem(d.item)
        })
        .catch(() => {})
        .finally(() => setProbing(false))
    }
  }, [media.id])

  const handleFav = async () => {
    const next = await toggleFavorite(item.id)
    setFav(next)
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const containerName = item.container.toLowerCase() === 'mkv' ? 'Matroska' : item.container.toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <Badge tone="cyan">{containerName}</Badge>
              <Badge>{item.chatTitle}</Badge>
            </div>
            <h2 className="text-lg font-semibold text-foreground break-all">{item.filename}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <HardDrive size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Size</p>
              <p className="text-sm font-semibold font-mono">{formatBytes(item.fileSize)}</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <Clock size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
              <p className="text-sm font-semibold font-mono">{formatTime(item.duration || 0)}</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <Film size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Container</p>
              <p className="text-sm font-semibold">{containerName}</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
              <Monitor size={16} className="mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resolution</p>
              <p className="text-sm font-semibold">
                {item.videoTracks?.[0]?.height ? `${item.videoTracks[0].height}p` : item.height ? `${item.height}p` : 'Auto'}
              </p>
            </div>
          </div>

          {/* Video Track Analysis */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Film size={14} className="text-cyan-400" /> Video Details
              </h3>
              {probing && <span className="text-[10px] text-cyan-300 animate-pulse">Inspecting tracks via FFprobe…</span>}
            </div>

            {item.videoTracks && item.videoTracks.length > 0 ? (
              item.videoTracks.map((vt, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                  <span className="font-medium text-foreground">{vt.codec}</span>
                  <span className="text-muted-foreground font-mono">
                    {vt.width} × {vt.height} {vt.fps ? `• ${vt.fps} FPS` : ''}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Standard video stream</p>
            )}
          </div>

          {/* Audio Tracks Analysis */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Headphones size={14} className="text-cyan-400" /> Audio Tracks ({item.audioTracks?.length || 1})
            </h3>
            {item.audioTracks && item.audioTracks.length > 0 ? (
              item.audioTracks.map((at, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{at.title || `Audio Track ${i + 1}`}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {at.language ? at.language.toUpperCase() : 'UND'} • {at.channels === 6 ? '5.1 Surround' : 'Stereo'} • {at.codec}
                    </p>
                  </div>
                  {at.isDefault && <Badge tone="cyan">Default</Badge>}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Primary audio track (Stereo)</p>
            )}
          </div>

          {/* Subtitle Tracks Analysis */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Subtitles size={14} className="text-cyan-400" /> Subtitle Tracks ({item.subtitleTracks?.length || 0})
            </h3>
            {item.subtitleTracks && item.subtitleTracks.length > 0 ? (
              item.subtitleTracks.map((st, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{st.title || `Subtitle ${i + 1}`}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {st.language ? st.language.toUpperCase() : 'Embedded'} • {st.codec}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {st.isDefault && <Badge tone="cyan">Default</Badge>}
                    {st.isForced && <Badge>Forced</Badge>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No embedded subtitles detected</p>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleFav}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                fav
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-400'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Heart size={14} className={fav ? 'fill-rose-500 text-rose-500' : ''} />
              {fav ? 'Favorited' : 'Favorite'}
            </button>

            {onAddToCourse && (
              <button
                onClick={() => { onAddToCourse(item); onClose() }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <FolderPlus size={14} /> Add to Course
              </button>
            )}

            {onAddToPlaylist && (
              <button
                onClick={() => { onAddToPlaylist(item); onClose() }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <ListPlus size={14} /> Playlist
              </button>
            )}
          </div>

          <button
            onClick={() => { onPlay(item); onClose() }}
            className="flex items-center gap-2 rounded-lg bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition shadow"
          >
            <Play size={16} fill="currentColor" />
            Play in Advanced Player
          </button>
        </div>
      </div>
    </div>
  )
}
