/**
 * scanner.ts — Main course scanner orchestrator. Server-side only.
 *
 * Reads COURSE_ROOT from mltrack-config.json and builds a full ScanResult.
 *
 * RULES:
 * - NEVER modifies source files or archives
 * - NEVER extracts videos during scanning (metadata only)
 * - Marks uncertain assignments; does NOT silently mislabel lectures
 * - Reports all warnings; does NOT crash on unexpected files
 */

import fs from 'fs'
import path from 'path'
import { getStorageFilePath } from '@/lib/storagePaths'
import { scanZip, type ZipEntry } from './zipScanner'
import { generateId, generateLooseFileId } from './idGenerator'
import { cleanTitle, cleanFolderName } from './titleCleaner'
import { detectArchiveType, detectInternalFolder, formatDayLabel } from './dayDetector'
import { classifyFile, isVideoFile, isPdfFile, isSelfStudyFolder } from './contentDetector'
import { isEntryPathSafe } from './pathValidator'
import type {
  ScanResult,
  ScanWarning,
  ScanStats,
  DayGroup,
  MentoringSession,
  SelfStudySection,
  CourseItem,
  FolderGroup,
  ContentType,
  DayAssignmentConfidence,
} from '@/lib/types'

// ─── Config ───────────────────────────────────────────────────────────────────

export function readConfig(): { courseRoot: string } {
  try {
    const configPath = getStorageFilePath('mltrack-config.json')
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { courseRoot: '' }
  }
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────

export async function scanCourse(courseRoot?: string): Promise<ScanResult> {
  const root = courseRoot ?? readConfig().courseRoot

  if (!root) {
    return emptyResult('', [{ level: 'ERROR', message: 'Course root is not configured. Go to Settings to set your course folder.' }])
  }

  // Validate the directory exists
  try {
    const stat = fs.statSync(root)
    if (!stat.isDirectory()) {
      return emptyResult(root, [{ level: 'ERROR', message: `Course root is not a directory: ${root}` }])
    }
  } catch {
    return emptyResult(root, [{ level: 'ERROR', message: `Course root directory not found: ${root}` }])
  }

  const warnings: ScanWarning[] = []
  const days: DayGroup[] = []
  const mentoring: MentoringSession[] = []
  const selfStudy: SelfStudySection[] = []

  // Read top-level items
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch (e) {
    return emptyResult(root, [{
      level: 'ERROR',
      message: `Cannot read course directory: ${(e as Error).message}`,
    }])
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      await processFolder(fullPath, entry.name, days, mentoring, selfStudy, warnings)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) {
      await processZip(fullPath, entry.name, days, mentoring, selfStudy, warnings)
    } else if (entry.isFile() && isVideoFile(entry.name)) {
      // Loose video at course root level — unlikely but handle gracefully
      warnings.push({ level: 'WARNING', message: `Loose video at course root: ${entry.name}. Consider organizing into a day folder.` })
    }
    // Other files at root level: silently skip
  }

  // Sort days by first day number
  days.sort((a, b) => (a.dayNumbers[0] ?? 999) - (b.dayNumbers[0] ?? 999))

  const stats = computeStats(days, mentoring, selfStudy)

  return {
    scannedAt: new Date().toISOString(),
    courseRoot: root,
    days,
    mentoring,
    selfStudy,
    warnings,
    stats,
  }
}

// ─── ZIP Processing ───────────────────────────────────────────────────────────

async function processZip(
  zipPath: string,
  zipName: string,
  days: DayGroup[],
  mentoring: MentoringSession[],
  selfStudy: SelfStudySection[],
  warnings: ScanWarning[]
): Promise<void> {
  const detection = detectArchiveType(zipName)

  let zipEntries: ZipEntry[]
  try {
    zipEntries = await scanZip(zipPath)
  } catch (e) {
    warnings.push({
      level: 'ERROR',
      message: `Cannot read ZIP archive: ${zipName} — ${(e as Error).message}`,
      affectedArchive: zipName,
    })
    return
  }

  if (detection.type === 'MENTORING') {
    const session = buildMentoringFromZip(zipPath, zipName, zipEntries, warnings, mentoring.length + 1)
    mentoring.push(session)
    return
  }

  if (detection.type === 'SELF_STUDY') {
    const ss = buildSelfStudyFromZip(zipPath, zipName, zipEntries, warnings)
    selfStudy.push(ss)
    return
  }

  if (detection.type === 'DAY') {
    // Check internal structure to verify assignment
    const internalDayFolders = findInternalDayFolders(zipEntries)
    let finalConfidence = detection.confidence

    if (detection.dayNumbers.length > 1) {
      // Multi-day archive — check if internal folders clarify assignment
      if (internalDayFolders.length > 0) {
        // Internal day folders found — can assign more confidently
        finalConfidence = 'INFERRED_FROM_ARCHIVE'
        // Build separate day groups from internal structure
        await buildMultiDayFromZipWithInternalFolders(
          zipPath,
          zipName,
          detection.dayNumbers,
          zipEntries,
          internalDayFolders,
          days,
          warnings
        )
        return
      } else {
        // No internal structure to differentiate → UNCERTAIN
        finalConfidence = 'UNCERTAIN'
        warnings.push({
          level: 'WARNING',
          message: `${zipName} contains multiple days (${detection.dayNumbers.join(', ')}) but internal structure does not clearly separate them. Manual assignment may be needed.`,
          affectedArchive: zipName,
        })
      }
    }

    // Build a single day group (may span multiple days if uncertain)
    const dayGroup = buildDayFromZip(
      zipPath,
      zipName,
      detection.dayNumbers,
      detection.label,
      finalConfidence,
      zipEntries,
      warnings
    )

    if (detection.dayNumbers.length > 1 && finalConfidence === 'UNCERTAIN') {
      dayGroup.assignmentWarning = `Content could not be confidently assigned to individual days. Manual assignment recommended.`
    }

    days.push(dayGroup)
    return
  }

  // UNKNOWN type — report and skip
  warnings.push({
    level: 'WARNING',
    message: `Cannot determine day for archive: ${zipName}. Skipping.`,
    affectedArchive: zipName,
  })
}

// ─── Folder Processing ────────────────────────────────────────────────────────

async function processFolder(
  folderPath: string,
  folderName: string,
  days: DayGroup[],
  mentoring: MentoringSession[],
  selfStudy: SelfStudySection[],
  warnings: ScanWarning[]
): Promise<void> {
  const detection = detectArchiveType(folderName)

  if (detection.type === 'MENTORING') {
    const session = buildMentoringFromFolder(folderPath, folderName, warnings)
    mentoring.push(session)
    return
  }

  if (detection.type === 'SELF_STUDY' || isSelfStudyFolder(folderName)) {
    const ss = buildSelfStudyFromFolder(folderPath, folderName, warnings)
    selfStudy.push(ss)
    return
  }

  if (detection.type === 'DAY') {
    const dayGroup = buildDayFromFolder(
      folderPath,
      folderName,
      detection.dayNumbers,
      detection.label,
      detection.confidence,
      warnings
    )
    days.push(dayGroup)
    return
  }

  warnings.push({
    level: 'INFO',
    message: `Unrecognized folder at course root: ${folderName}. Skipping.`,
  })
}

// ─── Day Building from ZIP ────────────────────────────────────────────────────

function buildDayFromZip(
  zipPath: string,
  zipName: string,
  dayNumbers: number[],
  label: string,
  confidence: DayAssignmentConfidence,
  zipEntries: ZipEntry[],
  warnings: ScanWarning[]
): DayGroup {
  const id = generateId(zipPath, `__day_${dayNumbers.join('+')}`)
  const { lectures, resources, subFolders, selfStudySections } = organizeZipEntries(zipPath, zipName, zipEntries, warnings)

  return {
    id,
    dayNumbers,
    label,
    sourceArchive: zipName,
    assignmentConfidence: confidence,
    lectures,
    resources,
    selfStudySections,
    subFolders,
  }
}

async function buildMultiDayFromZipWithInternalFolders(
  zipPath: string,
  zipName: string,
  expectedDays: number[],
  zipEntries: ZipEntry[],
  internalDayFolders: { folderName: string; dayNumber: number }[],
  days: DayGroup[],
  warnings: ScanWarning[]
): Promise<void> {
  for (const { folderName, dayNumber } of internalDayFolders) {
    const prefix = folderName + '/'
    const filteredEntries = zipEntries.filter(e => e.entryPath.startsWith(prefix)).map(e => ({
      ...e,
      entryPath: e.entryPath.slice(prefix.length),
    }))

    const label = `DAY ${String(dayNumber).padStart(2, '0')}`
    const { lectures, resources, subFolders, selfStudySections } = organizeZipEntries(zipPath, zipName, filteredEntries, warnings, prefix)

    days.push({
      id: generateId(zipPath, `__day_${dayNumber}`),
      dayNumbers: [dayNumber],
      label,
      sourceArchive: zipName,
      assignmentConfidence: 'INFERRED_FROM_ARCHIVE',
      assignmentWarning: `Day ${dayNumber} inferred from internal folder "${folderName}" inside ${zipName}`,
      lectures,
      resources,
      selfStudySections,
      subFolders,
    })
  }

  // Check for days mentioned in archive name but not found internally
  const foundDays = internalDayFolders.map(f => f.dayNumber)
  const missingDays = expectedDays.filter(d => !foundDays.includes(d))
  if (missingDays.length > 0) {
    warnings.push({
      level: 'WARNING',
      message: `${zipName}: Days ${missingDays.join(', ')} expected from archive name but no internal folder found.`,
      affectedArchive: zipName,
    })
  }
}

// ─── Day Building from Folder ──────────────────────────────────────────────────

function buildDayFromFolder(
  folderPath: string,
  folderName: string,
  dayNumbers: number[],
  label: string,
  confidence: DayAssignmentConfidence,
  warnings: ScanWarning[]
): DayGroup {
  const id = generateLooseFileId(folderPath)
  const { lectures, resources, subFolders, selfStudySections } = organizeFolderContents(folderPath, warnings)

  return {
    id,
    dayNumbers,
    label,
    sourceArchive: folderName,
    assignmentConfidence: confidence,
    lectures,
    resources,
    selfStudySections,
    subFolders,
  }
}

// ─── Mentoring ────────────────────────────────────────────────────────────────

function buildMentoringFromZip(
  zipPath: string,
  zipName: string,
  zipEntries: ZipEntry[],
  warnings: ScanWarning[],
  defaultSessionNumber = 1
): MentoringSession {
  const videoEntries = zipEntries.filter(e => !e.isDirectory && isVideoFile(e.entryPath))
  const items: CourseItem[] = videoEntries.map((e, i) => {
    const classified = classifyFile(e.entryPath)
    if (classified.warning) warnings.push({ level: 'WARNING', message: classified.warning, affectedArchive: zipName })
    return {
      id: generateId(zipPath, e.entryPath),
      type: 'MENTORING' as ContentType,
      title: cleanTitle(path.basename(e.entryPath)),
      originalFilename: path.basename(e.entryPath),
      sourceArchive: zipName,
      sourcePath: e.entryPath,
      folderPath: [],
      duration: null,
      sizeBytes: e.sizeBytes,
    }
  })

  const sessionNumber = extractSessionNumber(zipName) ?? defaultSessionNumber
  return {
    id: generateId(zipPath, '__mentoring'),
    title: `Mentoring Session ${String(sessionNumber).padStart(2, '0')}`,
    sourceArchive: zipName,
    items,
  }
}

function buildMentoringFromFolder(
  folderPath: string,
  folderName: string,
  warnings: ScanWarning[]
): MentoringSession {
  const items = walkFolderForItems(folderPath, folderName, [], warnings, 'MENTORING')
  const sessionNumber = extractSessionNumber(folderName)
  return {
    id: generateLooseFileId(folderPath),
    title: sessionNumber
      ? `Mentoring Session ${String(sessionNumber).padStart(2, '0')}`
      : cleanFolderName(folderName),
    sourceArchive: folderName,
    items,
  }
}

// ─── Self Study ───────────────────────────────────────────────────────────────

function buildSelfStudyFromZip(
  zipPath: string,
  zipName: string,
  zipEntries: ZipEntry[],
  warnings: ScanWarning[]
): SelfStudySection {
  const videoEntries = zipEntries.filter(e => !e.isDirectory && isVideoFile(e.entryPath))
  const resources = zipEntries.filter(e => !e.isDirectory && isPdfFile(e.entryPath)).map(e => ({
    id: generateId(zipPath, e.entryPath),
    type: 'PDF' as ContentType,
    title: cleanTitle(path.basename(e.entryPath)),
    originalFilename: path.basename(e.entryPath),
    sourceArchive: zipName,
    sourcePath: e.entryPath,
    folderPath: [],
    duration: null,
    sizeBytes: e.sizeBytes,
  }))

  return {
    id: generateId(zipPath, '__self_study'),
    name: cleanFolderName(zipName.replace(/\.zip$/i, '')),
    dayNumbers: [],
    resources,
    isEmpty: videoEntries.length === 0 && resources.length === 0,
  }
}

function buildSelfStudyFromFolder(
  folderPath: string,
  folderName: string,
  warnings: ScanWarning[]
): SelfStudySection {
  let items: fs.Dirent[] = []
  try {
    items = fs.readdirSync(folderPath, { withFileTypes: true })
  } catch {
    warnings.push({ level: 'WARNING', message: `Cannot read self-study folder: ${folderName}` })
  }

  const resources: CourseItem[] = items
    .filter(e => e.isFile() && (isPdfFile(e.name) || !isVideoFile(e.name)))
    .map(e => ({
      id: generateLooseFileId(path.join(folderPath, e.name)),
      type: 'RESOURCE' as ContentType,
      title: cleanTitle(e.name),
      originalFilename: e.name,
      sourceArchive: null,
      sourcePath: path.join(folderPath, e.name),
      folderPath: [folderName],
      duration: null,
      sizeBytes: 0,
    }))

  return {
    id: generateLooseFileId(folderPath),
    name: cleanFolderName(folderName),
    dayNumbers: [],
    resources,
    isEmpty: items.filter(e => e.isFile()).length === 0,
  }
}

// ─── Entry Organization ───────────────────────────────────────────────────────

function organizeZipEntries(
  zipPath: string,
  zipName: string,
  entries: ZipEntry[],
  warnings: ScanWarning[],
  pathPrefix = ''
): { lectures: CourseItem[]; resources: CourseItem[]; subFolders: FolderGroup[]; selfStudySections: SelfStudySection[] } {
  const lectures: CourseItem[] = []
  const resources: CourseItem[] = []
  const selfStudySections: SelfStudySection[] = []
  const folderMap = new Map<string, CourseItem[]>()

  // Build set of top-level folders (depth 1)
  const topLevelFolders = new Set<string>()
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const parts = entry.entryPath.split('/')
    if (parts.length > 1) {
      topLevelFolders.add(parts[0])
    }
  }

  // Check if any top-level folder is self-study
  for (const folder of topLevelFolders) {
    if (isSelfStudyFolder(folder)) {
      const folderEntries = entries.filter(e => e.entryPath.startsWith(folder + '/'))
      const resources = folderEntries.filter(e => !e.isDirectory && isPdfFile(e.entryPath)).map(e => ({
        id: generateId(zipPath, pathPrefix + e.entryPath),
        type: 'PDF' as ContentType,
        title: cleanTitle(path.basename(e.entryPath)),
        originalFilename: path.basename(e.entryPath),
        sourceArchive: zipName,
        sourcePath: pathPrefix + e.entryPath,
        folderPath: [folder],
        duration: null,
        sizeBytes: e.sizeBytes,
      }))
      selfStudySections.push({
        id: generateId(zipPath, pathPrefix + folder),
        name: cleanFolderName(folder),
        dayNumbers: [],
        resources,
        isEmpty: folderEntries.filter(e => !e.isDirectory).length === 0,
      })
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory) continue
    if (!isEntryPathSafe(entry.entryPath)) {
      warnings.push({ level: 'WARNING', message: `Skipping unsafe path: ${entry.entryPath}`, affectedArchive: zipName })
      continue
    }

    const parts = entry.entryPath.split('/')
    const filename = parts[parts.length - 1]
    const folderPart = parts.slice(0, -1)

    // Skip self-study folder content (already handled)
    if (folderPart.length > 0 && isSelfStudyFolder(folderPart[0])) continue

    const classified = classifyFile(filename)
    if (classified.warning) {
      warnings.push({ level: 'WARNING', message: classified.warning, affectedArchive: zipName })
    }

    if (classified.contentType === 'OTHER') continue  // skip unsupported silently

    const item: CourseItem = {
      id: generateId(zipPath, pathPrefix + entry.entryPath),
      type: classified.contentType,
      title: cleanTitle(filename),
      originalFilename: filename,
      sourceArchive: zipName,
      sourcePath: pathPrefix + entry.entryPath,
      folderPath: folderPart,
      duration: null,
      sizeBytes: entry.sizeBytes,
    }

    if (classified.contentType === 'VIDEO') {
      if (folderPart.length > 0) {
        const folderKey = folderPart.join('/')
        if (!folderMap.has(folderKey)) folderMap.set(folderKey, [])
        folderMap.get(folderKey)!.push(item)
      } else {
        lectures.push(item)
      }
    } else {
      resources.push(item)
    }
  }

  // Sort lectures by original filename (preserves numeric ordering)
  lectures.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename, undefined, { numeric: true }))

  // Build sub-folders
  const subFolders: FolderGroup[] = []
  for (const [folderKey, items] of folderMap.entries()) {
    items.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename, undefined, { numeric: true }))
    subFolders.push({ name: cleanFolderName(folderKey.split('/').pop() ?? folderKey), items })
  }

  return { lectures, resources, subFolders, selfStudySections }
}

function organizeFolderContents(
  folderPath: string,
  warnings: ScanWarning[]
): { lectures: CourseItem[]; resources: CourseItem[]; subFolders: FolderGroup[]; selfStudySections: SelfStudySection[] } {
  const lectures: CourseItem[] = []
  const resources: CourseItem[] = []
  const subFolders: FolderGroup[] = []
  const selfStudySections: SelfStudySection[] = []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true })
  } catch {
    return { lectures, resources, subFolders, selfStudySections }
  }

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name)

    if (entry.isDirectory()) {
      if (isSelfStudyFolder(entry.name)) {
        selfStudySections.push(buildSelfStudyFromFolder(fullPath, entry.name, warnings))
        continue
      }
      // Sub-folder — collect its videos
      const subItems = walkFolderForItems(fullPath, entry.name, [entry.name], warnings, 'VIDEO')
      if (subItems.length > 0) {
        subFolders.push({ name: cleanFolderName(entry.name), items: subItems })
      }
      continue
    }

    if (!entry.isFile()) continue

    const classified = classifyFile(entry.name)
    if (classified.warning) warnings.push({ level: 'WARNING', message: classified.warning })
    if (classified.contentType === 'OTHER') continue

    const item: CourseItem = {
      id: generateLooseFileId(fullPath),
      type: classified.contentType,
      title: cleanTitle(entry.name),
      originalFilename: entry.name,
      sourceArchive: null,
      sourcePath: fullPath,
      folderPath: [],
      duration: null,
      sizeBytes: 0,
    }

    if (classified.contentType === 'VIDEO') {
      lectures.push(item)
    } else {
      resources.push(item)
    }
  }

  lectures.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename, undefined, { numeric: true }))
  return { lectures, resources, subFolders, selfStudySections }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findInternalDayFolders(entries: ZipEntry[]): { folderName: string; dayNumber: number }[] {
  const result: { folderName: string; dayNumber: number }[] = []
  const seenFolders = new Set<string>()

  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const topLevel = entry.entryPath.split('/')[0]
    if (seenFolders.has(topLevel)) continue
    seenFolders.add(topLevel)

    const detection = detectInternalFolder(topLevel)
    if (detection.type === 'DAY' && detection.dayNumbers.length === 1) {
      result.push({ folderName: topLevel, dayNumber: detection.dayNumbers[0] })
    }
  }

  return result
}

function walkFolderForItems(
  folderPath: string,
  folderName: string,
  breadcrumb: string[],
  warnings: ScanWarning[],
  forcedType: ContentType
): CourseItem[] {
  const items: CourseItem[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true })
  } catch {
    return items
  }

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      items.push(...walkFolderForItems(fullPath, entry.name, [...breadcrumb, entry.name], warnings, forcedType))
      continue
    }
    if (!entry.isFile()) continue

    if (isVideoFile(entry.name)) {
      items.push({
        id: generateLooseFileId(fullPath),
        type: forcedType,
        title: cleanTitle(entry.name),
        originalFilename: entry.name,
        sourceArchive: null,
        sourcePath: fullPath,
        folderPath: breadcrumb,
        duration: null,
        sizeBytes: 0,
      })
    }
  }

  items.sort((a, b) => a.originalFilename.localeCompare(b.originalFilename, undefined, { numeric: true }))
  return items
}

function extractSessionNumber(name: string): number | null {
  const match = name.match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

function computeStats(
  days: DayGroup[],
  mentoring: MentoringSession[],
  selfStudy: SelfStudySection[]
): ScanStats {
  let totalArchives = 0
  let mentoringArchives = mentoring.length
  let totalVideos = 0
  let totalPdfs = 0
  let totalSelfStudySections = selfStudy.length
  let uncertainAssignments = 0

  const seenArchives = new Set<string>()
  for (const day of days) {
    if (!seenArchives.has(day.sourceArchive)) {
      seenArchives.add(day.sourceArchive)
      totalArchives++
    }
    if (day.assignmentConfidence === 'UNCERTAIN') uncertainAssignments++

    const allItems = [...day.lectures, ...day.resources, ...day.subFolders.flatMap(f => f.items)]
    totalVideos += allItems.filter(i => i.type === 'VIDEO').length
    totalPdfs += allItems.filter(i => i.type === 'PDF').length
  }

  for (const m of mentoring) {
    totalVideos += m.items.filter(i => i.type === 'MENTORING').length
  }

  return { totalArchives, mentoringArchives, totalVideos, totalPdfs, totalSelfStudySections, uncertainAssignments }
}

function emptyResult(courseRoot: string, warnings: ScanWarning[]): ScanResult {
  return {
    scannedAt: new Date().toISOString(),
    courseRoot,
    days: [],
    mentoring: [],
    selfStudy: [],
    warnings,
    stats: { totalArchives: 0, mentoringArchives: 0, totalVideos: 0, totalPdfs: 0, totalSelfStudySections: 0, uncertainAssignments: 0 },
  }
}
