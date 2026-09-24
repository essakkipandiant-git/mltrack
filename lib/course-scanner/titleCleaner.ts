import path from 'path'

/**
 * Clean a raw filename into a human-readable display title.
 *
 * Rules:
 * 1. Remove file extension
 * 2. Strip leading numeric prefix: "01 ", "01. ", "1. ", "1 - "
 * 3. Strip trailing underscores/dashes/spaces
 * 4. Normalize multiple spaces
 * 5. Preserve meaningful content
 */
export function cleanTitle(filename: string): string {
  // Remove extension
  let title = path.basename(filename, path.extname(filename))

  // Strip leading numeric prefix patterns:
  // "01 Course Objective" → "Course Objective"
  // "01. Course Objective" → "Course Objective"
  // "1 - Course" → "Course"
  // "4. Why did we choose Python_" → "Why did we choose Python"
  title = title.replace(/^\d+[\s.\-_]+/, '')

  // Strip trailing underscores, dashes, spaces
  title = title.replace(/[\s_\-]+$/, '')

  // Normalize multiple spaces
  title = title.replace(/\s{2,}/g, ' ').trim()

  // If empty after cleaning, return original basename without extension
  if (!title) {
    title = path.basename(filename, path.extname(filename))
  }

  return title
}

/**
 * Clean a folder name for display (remove leading numbers etc.)
 */
export function cleanFolderName(name: string): string {
  // Remove leading numeric prefix from folder names
  const cleaned = name.replace(/^\d+[\s.\-_]+/, '').trim()
  return cleaned || name
}
