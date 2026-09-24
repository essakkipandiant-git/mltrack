/**
 * zipScanner.ts — Server-side only. Uses yauzl to inspect ZIP archives.
 *
 * IMPORTANT:
 * - Reads ONLY the ZIP central directory (metadata) — does NOT extract content
 * - Never loads the full archive into memory
 * - Safe for multi-GB ZIP files
 */

import yauzl from 'yauzl'

export interface ZipEntry {
  entryPath: string       // internal path (forward slashes)
  sizeBytes: number       // uncompressed size
  compressedSize: number
  isDirectory: boolean
}

/**
 * Read all entries from a ZIP archive without extracting anything.
 * Uses yauzl's lazyEntries mode to stream through the central directory.
 */
export async function scanZip(zipPath: string): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) {
        reject(new Error(`Failed to open ZIP ${zipPath}: ${err.message}`))
        return
      }
      if (!zipfile) {
        reject(new Error(`ZIP file object is null for ${zipPath}`))
        return
      }

      const entries: ZipEntry[] = []

      zipfile.readEntry()

      zipfile.on('entry', (entry: yauzl.Entry) => {
        // Normalize path separators to forward slashes
        const entryPath = (entry.fileName as string).replace(/\\/g, '/')

        entries.push({
          entryPath,
          sizeBytes: entry.uncompressedSize,
          compressedSize: entry.compressedSize,
          isDirectory: entryPath.endsWith('/'),
        })

        zipfile.readEntry()
      })

      zipfile.on('end', () => {
        resolve(entries)
      })

      zipfile.on('error', (zipErr: Error) => {
        reject(new Error(`Error reading ZIP ${zipPath}: ${zipErr.message}`))
      })
    })
  })
}

/**
 * Extract a single entry from a ZIP archive to a writable stream.
 *
 * @param zipPath     - Absolute path to the ZIP file
 * @param entryPath   - Internal path within the ZIP (normalized, forward slashes)
 * @param destPath    - Absolute path for the extracted output file
 */
export async function extractEntry(
  zipPath: string,
  entryPath: string,
  destPath: string
): Promise<void> {
  const { createWriteStream } = await import('fs')
  const { pipeline } = await import('stream/promises')

  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err) return reject(new Error(`Cannot open ZIP: ${err.message}`))
      if (!zipfile) return reject(new Error('ZIP file object is null'))

      let found = false

      zipfile.readEntry()

      zipfile.on('entry', (entry: yauzl.Entry) => {
        const normalizedEntry = (entry.fileName as string).replace(/\\/g, '/')

        if (normalizedEntry !== entryPath) {
          // Not our entry — skip
          zipfile.readEntry()
          return
        }

        found = true

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close()
            return reject(new Error(`Cannot open read stream for ${entryPath}: ${streamErr?.message}`))
          }

          const writeStream = createWriteStream(destPath)

          pipeline(readStream, writeStream)
            .then(() => {
              zipfile.close()
              resolve()
            })
            .catch((pipeErr) => {
              zipfile.close()
              reject(new Error(`Extraction failed for ${entryPath}: ${pipeErr.message}`))
            })
        })
      })

      zipfile.on('end', () => {
        if (!found) {
          zipfile.close()
          reject(new Error(`Entry "${entryPath}" not found in ${zipPath}`))
        }
      })

      zipfile.on('error', (zipErr: Error) => {
        reject(new Error(`ZIP error during extraction: ${zipErr.message}`))
      })
    })
  })
}
