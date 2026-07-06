import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useState } from 'react'
import { isTauri } from '@/lib/tauri'

/**
 * Lifecycle of an update check-and-install:
 * - `idle`        nothing attempted yet this session
 * - `checking`    talking to the release endpoint
 * - `available`   a newer version exists and is ready to download
 * - `downloading` fetching + applying the package (see `progress`)
 * - `ready`       installed; a relaunch is imminent
 * - `upToDate`    the check completed and we're already current
 * - `error`       the check or install failed (e.g. offline)
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'upToDate'
  | 'error'

export interface Updater {
  status: UpdateStatus
  /** Download progress as a fraction in `[0, 1]`; meaningful while downloading. */
  progress: number
  /** The available version, once a check has surfaced one. */
  version?: string
  check: () => Promise<void>
  install: () => Promise<void>
}

/**
 * Drives the `@tauri-apps/plugin-updater` flow for the UI. Every action
 * no-ops gracefully outside a Tauri runtime (browser dev, jsdom) so callers
 * never have to guard the environment themselves.
 */
export function useUpdater(): Updater {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [update, setUpdate] = useState<Update | null>(null)

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return
    setStatus('checking')
    try {
      const found = await check()
      if (found) {
        setUpdate(found)
        setStatus('available')
      } else {
        setStatus('upToDate')
      }
    } catch {
      setStatus('error')
    }
  }, [])

  const install = useCallback(async () => {
    if (!update) return
    setProgress(0)
    setStatus('downloading')
    try {
      let total = 0
      let received = 0
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength
          setProgress(total ? received / total : 0)
        } else if (event.event === 'Finished') {
          setProgress(1)
          setStatus('ready')
        }
      })
      await relaunch()
    } catch {
      setStatus('error')
    }
  }, [update])

  return {
    status,
    progress,
    version: update?.version,
    check: checkForUpdates,
    install,
  }
}
