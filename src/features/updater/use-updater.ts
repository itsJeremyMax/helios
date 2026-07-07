import { useQuery } from '@tanstack/react-query'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useState } from 'react'
import { queryKeys } from '@/lib/ipc'
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
 * The shared update-check query function. Runs a real check against the release
 * endpoint and resolves to the pending {@link Update} (or `null` when current).
 * No-ops to `null` outside a Tauri runtime so browser dev and jsdom stay quiet.
 *
 * Cached under {@link queryKeys.updateCheck} so the on-launch check and the
 * Settings card observe the *same* result: whichever runs first, the other
 * reads its answer without a redundant round-trip.
 */
export async function fetchUpdate(): Promise<Update | null> {
  if (!isTauri()) return null
  return (await check()) ?? null
}

/**
 * The install half of the lifecycle is intrinsically local to the component
 * that drives it (only the Settings card installs), so it stays in component
 * state — unlike the check result, which is shared through React Query.
 */
type InstallPhase = 'idle' | 'downloading' | 'ready' | 'error'

/**
 * Drives the `@tauri-apps/plugin-updater` flow for the UI. The check result is
 * shared cache (keyed by {@link queryKeys.updateCheck}), so every consumer —
 * the launch check and the Settings card — agrees on whether an update is
 * available. Every action no-ops gracefully outside a Tauri runtime (browser
 * dev, jsdom) so callers never have to guard the environment themselves.
 */
export function useUpdater(): Updater {
  const [installPhase, setInstallPhase] = useState<InstallPhase>('idle')
  const [progress, setProgress] = useState(0)

  const query = useQuery({
    queryKey: queryKeys.updateCheck,
    queryFn: fetchUpdate,
    // Only run when explicitly asked (launch check or a card click). Once a
    // result lands it never goes stale on its own — the user re-checks by hand.
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
  const { refetch } = query
  const update = query.data ?? null

  const checkForUpdates = useCallback(async () => {
    setInstallPhase('idle')
    await refetch()
  }, [refetch])

  const install = useCallback(async () => {
    if (!update) return
    setProgress(0)
    setInstallPhase('downloading')
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
          setInstallPhase('ready')
        }
      })
      await relaunch()
    } catch {
      setInstallPhase('error')
    }
  }, [update])

  return {
    status: deriveStatus(query, installPhase),
    progress,
    version: update?.version,
    check: checkForUpdates,
    install,
  }
}

/** The subset of the check query {@link deriveStatus} reads. */
interface CheckState {
  isFetching: boolean
  isError: boolean
  isSuccess: boolean
  data?: Update | null
}

/**
 * Fold the shared check query and the local install phase into one status. The
 * install phase wins once an install is underway; otherwise the query state
 * decides (fetching → checking, an {@link Update} → available, a resolved
 * `null` → up to date, an error → error, nothing checked yet → idle).
 */
function deriveStatus(
  { isFetching, isError, isSuccess, data }: CheckState,
  installPhase: InstallPhase,
): UpdateStatus {
  if (installPhase === 'downloading') return 'downloading'
  if (installPhase === 'ready') return 'ready'
  if (installPhase === 'error') return 'error'
  if (isFetching) return 'checking'
  if (isError) return 'error'
  if (isSuccess) return data ? 'available' : 'upToDate'
  return 'idle'
}
