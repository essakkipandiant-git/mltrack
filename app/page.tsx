'use client'

import { useState } from 'react'
import {
  BookOpen, BrainCircuit, ChevronRight, FileText, Flame, History,
  LayoutDashboard, Library, Menu, Play, Search, Settings, Sparkles,
  Target, Upload, X, Zap, Send
} from 'lucide-react'

import { Dashboard } from './components/Dashboard'
import { Course } from './components/Course'
import { AdvancedPlayer, type PlayableItem } from './components/AdvancedPlayer/AdvancedPlayer'
import { TelegramLibrary } from './components/TelegramLibrary/TelegramLibrary'
import { ImportPage } from './components/ImportPage'
import { HistoryPage } from './components/HistoryPage'
import { NotesPage } from './components/NotesPage'
import { ProgressPage } from './components/ProgressPage'
import { MentoringPage } from './components/MentoringPage'
import { SelfStudyPage } from './components/SelfStudyPage'
import { SettingsPage } from './components/SettingsPage'
import { ProgressBar } from './components/shared'
import { useCourseData } from '@/hooks/useCourseData'
import { useProgress } from '@/hooks/useProgress'
import type { CourseItem, TelegramMedia } from '@/lib/types'

const nav = [
  { label: 'Overview',          icon: LayoutDashboard },
  { label: 'Course',            icon: BookOpen },
  { label: 'Telegram Library',   icon: Send },
  { label: 'Continue Learning', icon: Play },
  { label: 'Mentoring',         icon: BrainCircuit },
  { label: 'Self Study',        icon: Target },
  { label: 'History',           icon: History },
  { label: 'Notes',             icon: FileText },
  { label: 'Progress',          icon: Zap },
]

export default function Page() {
  const [page, setPage] = useState('Overview')
  const [selectedMedia, setSelectedMedia] = useState<PlayableItem | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { allLectures, reload: reloadCourse } = useCourseData()
  const { allProgress } = useProgress(null)

  // Sidebar progress bar
  const completedCount = allProgress.filter(p => p.completed).length
  const overallPct = allLectures.length > 0 ? Math.round((completedCount / allLectures.length) * 100) : 0

  const handlePlay = (lecture: CourseItem) => {
    setSelectedMedia({ type: 'course', data: lecture })
    setMobileOpen(false)
  }

  const handlePlayTelegram = (media: TelegramMedia) => {
    setSelectedMedia({ type: 'telegram', data: media })
    setMobileOpen(false)
  }

  const handleBack = () => {
    setSelectedMedia(null)
  }

  // Course Prev / Next navigation
  let currentCourseIdx = -1
  if (selectedMedia?.type === 'course') {
    currentCourseIdx = allLectures.findIndex(l => l.id === selectedMedia.data.id)
  }
  const prevCourseLecture = currentCourseIdx > 0 ? allLectures[currentCourseIdx - 1] : null
  const nextCourseLecture = currentCourseIdx >= 0 && currentCourseIdx < allLectures.length - 1 ? allLectures[currentCourseIdx + 1] : null

  const handleNavClick = (label: string) => {
    if (label === 'Continue Learning') {
      // Find the current in-progress lecture
      const inProgressMap = new Map(allProgress.filter(p => !p.completed && p.percentage > 0).map(p => [p.lectureId, p]))
      const current = allLectures.find(l => inProgressMap.has(l.id))
      if (current) {
        setSelectedMedia({ type: 'course', data: current })
      } else {
        setPage('Course')
      }
    } else {
      setPage(label)
      setSelectedMedia(null)
    }
    setMobileOpen(false)
  }

  const renderContent = () => {
    if (selectedMedia) {
      return (
        <AdvancedPlayer
          item={selectedMedia}
          onBack={handleBack}
          onNavigatePrev={prevCourseLecture ? () => setSelectedMedia({ type: 'course', data: prevCourseLecture }) : undefined}
          onNavigateNext={nextCourseLecture ? () => setSelectedMedia({ type: 'course', data: nextCourseLecture }) : undefined}
          hasPrev={!!prevCourseLecture}
          hasNext={!!nextCourseLecture}
        />
      )
    }
    switch (page) {
      case 'Overview':         return <Dashboard onPlay={handlePlay} setPage={setPage} />
      case 'Course':           return <Course onPlay={handlePlay} />
      case 'Telegram Library': return <TelegramLibrary onPlayMedia={handlePlayTelegram} />
      case 'Mentoring':        return <MentoringPage onPlay={handlePlay} />
      case 'Self Study':       return <SelfStudyPage />
      case 'History':          return <HistoryPage onPlay={handlePlay} />
      case 'Notes':            return <NotesPage onPlay={handlePlay} />
      case 'Progress':         return <ProgressPage />
      case 'Import / Library': return <ImportPage onImported={reloadCourse} />
      case 'Settings':         return <SettingsPage onCourseReset={reloadCourse} />
      default:                 return <Dashboard onPlay={handlePlay} setPage={setPage} />
    }
  }

  const currentTitle = selectedMedia
    ? (selectedMedia.type === 'course' ? selectedMedia.data.title : selectedMedia.data.filename)
    : page

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-20 w-64 border-r border-border bg-sidebar transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-cyan-400 text-slate-950">
            <BrainCircuit size={18} />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            ML<span className="text-cyan-300">Track</span>
          </span>
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-3">
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => handleNavClick(label)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                page === label && !selectedMedia
                  ? 'bg-cyan-400/10 font-medium text-cyan-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}

          <div className="my-3 border-t border-border" />

          <button
            onClick={() => handleNavClick('Import / Library')}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
              page === 'Import / Library' && !selectedMedia ? 'bg-cyan-400/10 text-cyan-300' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Library size={17} />
            Import / Library
          </button>

          <button
            onClick={() => handleNavClick('Settings')}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
              page === 'Settings' && !selectedMedia ? 'bg-cyan-400/10 text-cyan-300' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Settings size={17} />
            Settings
          </button>
        </nav>

        {/* Sidebar footer progress */}
        <div className="absolute inset-x-3 bottom-4 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Course progress</span>
            <span className="font-mono text-cyan-300">{overallPct}%</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={overallPct} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden">
            <Menu size={20} />
          </button>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex truncate max-w-lg">
            <span>Workspace</span>
            <ChevronRight size={14} className="shrink-0" />
            <span className="text-foreground truncate">{currentTitle}</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <button className="text-muted-foreground hover:text-foreground">
              <Search size={18} />
            </button>
            <button className="relative text-muted-foreground hover:text-foreground">
              <Sparkles size={18} />
              <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-cyan-400" />
            </button>
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-400/20 text-xs font-semibold text-amber-200">
              ES
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-7xl p-4 md:p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

