// ─── Content & Classification ─────────────────────────────────────────────────

export type ContentType = 'VIDEO' | 'PDF' | 'RESOURCE' | 'SELF_STUDY' | 'MENTORING' | 'OTHER'

export type DayAssignmentConfidence = 'CERTAIN' | 'INFERRED_FROM_ARCHIVE' | 'UNCERTAIN'

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

// ─── Course Structure ─────────────────────────────────────────────────────────

/** A single playable or readable item in the course */
export interface CourseItem {
  id: string                   // sha1(archivePath:internalPath) — stable across rescans
  type: ContentType
  title: string                // cleaned display title
  originalFilename: string
  sourceArchive: string | null // null for loose files
  sourcePath: string           // internal ZIP path or absolute filesystem path
  folderPath: string[]         // breadcrumb e.g. ['Course Introduction']
  duration: number | null      // seconds — null until first playback
  sizeBytes: number
}

/** Named sub-folder within a day */
export interface FolderGroup {
  name: string
  items: CourseItem[]
}

/** An empty or resource-only self-study section */
export interface SelfStudySection {
  id: string
  name: string
  dayNumbers: number[]
  resources: CourseItem[]
  isEmpty: boolean
}

/** A mentoring session archive/folder */
export interface MentoringSession {
  id: string
  title: string
  sourceArchive: string
  items: CourseItem[]
}

/** A course day (may span multiple calendar days) */
export interface DayGroup {
  id: string
  dayNumbers: number[]                      // [8,9,10,11] for combined days
  label: string                              // "DAY 08" or "DAYS 08–11"
  sourceArchive: string
  assignmentConfidence: DayAssignmentConfidence
  assignmentWarning?: string                 // shown in import preview
  lectures: CourseItem[]                     // direct lectures (flat)
  resources: CourseItem[]
  selfStudySections: SelfStudySection[]
  subFolders: FolderGroup[]                  // named sub-folders preserving hierarchy
}

/** Full result of a course scan */
export interface ScanResult {
  scannedAt: string
  courseRoot: string
  days: DayGroup[]
  mentoring: MentoringSession[]
  selfStudy: SelfStudySection[]
  warnings: ScanWarning[]
  stats: ScanStats
}

export interface ScanStats {
  totalArchives: number
  mentoringArchives: number
  totalVideos: number
  totalPdfs: number
  totalSelfStudySections: number
  uncertainAssignments: number
}

export interface ScanWarning {
  level: 'INFO' | 'WARNING' | 'ERROR'
  message: string
  affectedArchive?: string
  affectedItems?: string[]
}

/** Items that need manual day assignment before import */
export interface UncertainItem {
  item: CourseItem
  archiveName: string
  possibleDays: number[]
}

// ─── Learning Data ────────────────────────────────────────────────────────────

export interface LectureProgress {
  lectureId: string
  currentPosition: number      // seconds
  duration: number             // seconds
  percentage: number           // 0–100
  completed: boolean
  lastWatched: string          // ISO timestamp
}

/** User override for uncertain multi-day ZIP assignments */
export interface ManualAssignment {
  itemId: string
  assignedDayNumber: number | null  // null = "Unassigned"
  assignedAt: string
}

export interface WatchHistoryEntry {
  lectureId: string
  title: string
  dayLabel: string
  lastPosition: number
  percentage: number
  watchedAt: string            // ISO timestamp — used for sorting newest-first
}

export interface Note {
  id: string
  lectureId: string
  content: string
  videoTimestamp: number | null  // seconds — null if not timestamp-linked
  createdAt: string
  updatedAt: string
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  dailyLectureTarget: number        // default: 3
  defaultPlaybackSpeed: number      // default: 1.0
  autoplayNext: boolean             // default: true
  rememberPosition: boolean         // default: true
  separateMentoringProgress: boolean // default: true
  theme: 'dark'
}

export const DEFAULT_SETTINGS: AppSettings = {
  dailyLectureTarget: 3,
  defaultPlaybackSpeed: 1.0,
  autoplayNext: true,
  rememberPosition: true,
  separateMentoringProgress: true,
  theme: 'dark',
}

// ─── Video Cache ──────────────────────────────────────────────────────────────

/** Metadata about a locally cached video file (actual file lives on disk in .cache/videos/) */
export interface VideoCacheEntry {
  lectureId: string
  cachedPath: string           // absolute path: .cache/videos/<id>.mp4
  extension: string            // .mp4 / .webm etc.
  cachedAt: string
  sizeBytes: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MLTrackConfig {
  courseRoot: string
}

// ─── Telegram & Media Library ─────────────────────────────────────────────────

export interface TelegramChat {
  id: string
  title: string
  type: 'channel' | 'group' | 'chat'
  username?: string
}

export interface VideoTrackInfo {
  index: number
  codec: string
  width: number
  height: number
  fps?: number
  bitrate?: number
}

export interface AudioTrackInfo {
  index: number
  codec: string
  language?: string
  title?: string
  channels: number
  sampleRate?: number
  bitrate?: number
  isDefault?: boolean
}

export interface SubtitleTrackInfo {
  index: number
  codec: string
  language?: string
  title?: string
  isDefault?: boolean
  isForced?: boolean
  url?: string
}

export interface TelegramMedia {
  id: string                 // tg_${chatId}_${messageId}
  telegramMessageId: number
  chatId: string
  chatTitle: string
  filename: string
  mimeType: string
  fileSize: number
  date: string               // ISO timestamp
  duration: number | null    // seconds
  thumbnail?: string         // URL or base64 data
  mediaType: 'VIDEO' | 'AUDIO' | 'DOCUMENT'
  container: string          // 'mkv' | 'mp4' | 'webm' | 'mov' | 'avi' | 'm4v' | string
  width?: number
  height?: number
  videoTracks?: VideoTrackInfo[]
  audioTracks?: AudioTrackInfo[]
  subtitleTracks?: SubtitleTrackInfo[]
  isFavorite?: boolean
  indexedAt: string          // ISO timestamp
}

export interface TelegramScanStatus {
  status: 'idle' | 'scanning' | 'done' | 'error'
  currentChatTitle?: string
  indexedCount: number
  totalEstimated?: number
  lastIndexedAt?: string
  error?: string
}

export interface TelegramAuthStatus {
  connected: boolean
  user?: {
    id: string
    firstName: string
    lastName?: string
    username?: string
    phone?: string
  }
}

export interface Playlist {
  id: string
  name: string
  description?: string
  itemIds: string[]          // Telegram media IDs or lecture IDs
  createdAt: string
  updatedAt: string
}

export interface MediaPlaybackState {
  id: string                 // lectureId or telegramMedia.id
  title: string
  subTitle?: string
  currentPosition: number
  duration: number
  percentage: number
  completed: boolean
  lastWatched: string
  selectedAudioTrack?: number
  selectedSubtitleTrack?: number
  subtitleDelay?: number
  audioDelay?: number
  playbackSpeed?: number
}
