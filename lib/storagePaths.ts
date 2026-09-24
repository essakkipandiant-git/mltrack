import path from 'path'
import os from 'os'
import fs from 'fs'

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
)

/**
 * Returns a writable path for application storage files (JSON caches, configs).
 * In serverless environments (like Vercel), the project root is read-only,
 * so we resolve files in os.tmpdir() and copy any bundled seed data.
 */
export function getStorageFilePath(filename: string): string {
  if (isServerless) {
    const tmpPath = path.join(os.tmpdir(), filename)
    const rootPath = path.join(process.cwd(), filename)
    if (!fs.existsSync(tmpPath) && fs.existsSync(rootPath)) {
      try {
        fs.copyFileSync(rootPath, tmpPath)
      } catch {
        // Ignore seed copy errors
      }
    }
    return tmpPath
  }

  return path.join(process.cwd(), filename)
}

/**
 * Returns a writable path for extracted video file cache.
 */
export function getVideoCacheDir(): string {
  if (isServerless) {
    return path.join(os.tmpdir(), '.cache', 'videos')
  }
  return path.join(process.cwd(), '.cache', 'videos')
}
