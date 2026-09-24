'use client'

import React, { useState, useEffect } from 'react'
import { ListPlus, X, Plus } from 'lucide-react'
import { getPlaylists, createPlaylist, addToPlaylist } from '@/lib/storage/playlists'
import type { TelegramMedia, Playlist } from '@/lib/types'

interface AddToPlaylistModalProps {
  media: TelegramMedia
  onClose: () => void
  onSuccess: () => void
}

export function AddToPlaylistModal({ media, onClose, onSuccess }: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPlaylists().then(setPlaylists)
  }, [])

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlaylistName.trim()) return
    setSaving(true)
    try {
      const pl = await createPlaylist(newPlaylistName.trim())
      await addToPlaylist(pl.id, media.id)
      onSuccess()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleAddToExisting = async (playlistId: string) => {
    setSaving(true)
    try {
      await addToPlaylist(playlistId, media.id)
      onSuccess()
      onClose()
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
              <ListPlus size={16} />
            </div>
            <h2 className="font-semibold text-foreground">Add to Playlist</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Video</p>
            <p className="text-sm font-medium text-foreground truncate mt-0.5">{media.filename}</p>
          </div>

          {/* Existing Playlists */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {playlists.map(pl => {
              const alreadyIn = pl.itemIds.includes(media.id)
              return (
                <button
                  key={pl.id}
                  disabled={alreadyIn || saving}
                  onClick={() => handleAddToExisting(pl.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border/50 p-2.5 text-xs hover:bg-muted disabled:opacity-50 transition text-left"
                >
                  <span className="font-medium text-foreground">{pl.name}</span>
                  <span className="text-muted-foreground">{alreadyIn ? 'Already added' : `${pl.itemIds.length} items`}</span>
                </button>
              )
            })}
          </div>

          {/* Create new playlist toggle/input */}
          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-cyan-400 hover:text-cyan-300 transition"
            >
              <Plus size={14} /> Create New Playlist
            </button>
          ) : (
            <form onSubmit={handleCreateAndAdd} className="space-y-2 pt-2 border-t border-border">
              <input
                type="text"
                required
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name..."
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-cyan-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newPlaylistName.trim()}
                  className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create & Add'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
