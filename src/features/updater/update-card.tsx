import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { commands, queryKeys, unwrapResult } from '@/lib/ipc'
import { isTauri } from '@/lib/tauri'
import { Button } from '@/shared/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
import { Progress } from '@/shared/ui/progress'
import { type UpdateStatus, useUpdater } from './use-updater'

/** How each lifecycle state reads to the user: a status line and status icon. */
function statusLine(
  status: UpdateStatus,
  version: string | undefined,
  currentVersion: string | undefined,
  progress: number,
): { text: string; icon: ComponentType<{ className?: string }>; tone: string } {
  switch (status) {
    case 'checking':
      return { text: 'Checking for updates…', icon: Loader2, tone: 'spin' }
    case 'available':
      return {
        text: `Version ${version} is ready to install`,
        icon: Download,
        tone: 'text-primary',
      }
    case 'downloading':
      return {
        text: `Downloading… ${Math.round(progress * 100)}%`,
        icon: Loader2,
        tone: 'spin',
      }
    case 'ready':
      return {
        text: 'Update installed — restarting…',
        icon: Loader2,
        tone: 'spin',
      }
    case 'upToDate':
      return {
        text: "You're up to date",
        icon: CheckCircle2,
        tone: 'text-primary',
      }
    case 'error':
      return {
        text: "Couldn't check for updates. Check your connection.",
        icon: TriangleAlert,
        tone: 'text-destructive',
      }
    default:
      return {
        text: currentVersion
          ? `You're on version ${currentVersion}`
          : 'Check whether a newer version is available.',
        icon: RefreshCw,
        tone: 'text-muted-foreground',
      }
  }
}

/** The primary action changes shape across the lifecycle. */
function primaryAction(
  status: UpdateStatus,
  check: () => void,
  install: () => void,
): { label: string; onClick: () => void; disabled: boolean; busy: boolean } {
  switch (status) {
    case 'checking':
      return { label: 'Checking…', onClick: check, disabled: true, busy: true }
    case 'available':
      return {
        label: 'Install & restart',
        onClick: install,
        disabled: false,
        busy: false,
      }
    case 'downloading':
    case 'ready':
      return {
        label: 'Installing…',
        onClick: install,
        disabled: true,
        busy: true,
      }
    case 'error':
      return {
        label: 'Try again',
        onClick: check,
        disabled: false,
        busy: false,
      }
    default:
      return {
        label: 'Check for updates',
        onClick: check,
        disabled: false,
        busy: false,
      }
  }
}

/**
 * Settings card that surfaces the installed version and drives a manual
 * update check → install → relaunch. Kept visually in step with the other
 * settings cards: a single labelled row with a trailing action, plus a
 * progress bar that only appears mid-download.
 */
export function UpdateCard() {
  const { data: appInfo } = useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: async () => unwrapResult(await commands.appInfo()),
    enabled: isTauri(),
  })
  const { status, progress, version, check, install } = useUpdater()

  const line = statusLine(status, version, appInfo?.version, progress)
  const action = primaryAction(status, check, install)
  // The in-app updater can only self-update the Linux .AppImage; .deb/.rpm
  // installs must go through the system package manager. We can't tell the two
  // apart at runtime (both report platform "linux"), so we only surface the
  // hint when the updater can't proceed — a failed check or an up-to-date
  // no-op — never over a live "available" offer that an AppImage can honor.
  const showLinuxHint =
    appInfo?.platform === 'linux' &&
    (status === 'error' || status === 'upToDate')
  const ActionIcon = action.busy
    ? Loader2
    : status === 'available'
      ? Download
      : RotateCw

  return (
    <Card>
      <CardHeader>
        <CardTitle>Software update</CardTitle>
        <CardDescription>
          Keep Helios current with the latest signed release.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <line.icon
              className={
                line.tone === 'spin'
                  ? 'size-3.5 animate-spin text-muted-foreground'
                  : `size-3.5 ${line.tone}`
              }
              aria-hidden="true"
            />
            <span className="text-sm" aria-live="polite">
              {line.text}
            </span>
          </div>
          <Button
            variant={status === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
            className="shrink-0"
          >
            <ActionIcon
              className={action.busy ? 'size-3.5 animate-spin' : 'size-3.5'}
            />
            {action.label}
          </Button>
        </div>

        {status === 'downloading' ? (
          <Progress
            value={Math.round(progress * 100)}
            aria-label="Update download progress"
          />
        ) : null}

        {showLinuxHint ? (
          <p className="text-xs text-muted-foreground">
            On Linux, only the <code>.AppImage</code> self-updates. If you
            installed via <code>.deb</code> or <code>.rpm</code>, update through
            your system package manager.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
